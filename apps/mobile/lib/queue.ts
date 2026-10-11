/**
 * Offline check-ins. Every check-in goes through this queue, online or not:
 * 1. stash  - photos are copied into the app's document folder and the check-in is saved on the phone
 * 2. upload - photos go to storage, then the check-in row is inserted (safe to repeat)
 * 3. verify - verify-checkin decides the verdict; retried if NIPOST or the network is down
 * With no signal an item just waits, and is retried when the app opens, comes back to the
 * foreground, or every minute while it's open. Nothing is lost if the app is closed.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const KEY = "gp.queue.v1";

export type QueueItem = {
  kind?: "checkin" | "plot";          // missing = checkin (items saved by app 1.1)
  id: string;                         // the check-in or plot-visit id
  propertyId: string;
  propertyLabel: string;
  takenAt: string;                    // when the photos were taken
  photos: string[];                   // file URIs inside the app's document folder
  video?: string | null;              // optional 15-second walk-round clip, same folder
  row: Record<string, unknown>;       // the checkins / plot_visits insert, minus upload-time fields
  beacons?: Record<string, unknown>[]; // plot visits: one beacon_checks row per beacon (photos[i] = "" if none)
  stage: "upload" | "verify";
  failed: string | null;              // set when the server refused it; the user can retry or discard
};

export type VerifyResult = {
  verdict: "verified" | "review" | "flagged" | "pending" | "match" | "partial" | "mismatch";
  reason: string;
  note?: string | null;
  match_type?: "postcode" | "coordinates";
};

export type Outcome =
  | { kind: "done"; result: VerifyResult }
  | { kind: "waiting" }               // no signal: still on the phone
  | { kind: "uploaded" }              // on the server, verdict still to come
  | { kind: "failed"; error: string };

// ---------- storage ----------
let cache: QueueItem[] | null = null;
const listeners = new Set<(q: QueueItem[]) => void>();

export async function getQueue(): Promise<QueueItem[]> {
  if (cache) return cache;
  try {
    cache = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]") as QueueItem[];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(q: QueueItem[]) {
  cache = q;
  await AsyncStorage.setItem(KEY, JSON.stringify(q));
  for (const l of listeners) l(q);
}

async function update(id: string, patch: Partial<QueueItem>) {
  const q = await getQueue();
  await save(q.map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

export function subscribe(fn: (q: QueueItem[]) => void): () => void {
  listeners.add(fn);
  getQueue().then(fn);
  return () => { listeners.delete(fn); };
}

function folder(id: string) {
  return new Directory(Paths.document, "queue", id);
}

/** Copy freshly taken photos (in the cache folder, which the OS may clear) somewhere safe. */
export function stashPhotos(id: string, uris: string[]): string[] {
  const dir = folder(id);
  dir.create({ intermediates: true, idempotent: true });
  return uris.map((uri, i) => {
    if (!uri) return "";
    const dest = new File(dir, `${i + 1}.jpg`);
    if (dest.exists) dest.delete();
    new File(uri).copySync(dest);
    return dest.uri;
  });
}

/** Copy the walk-round video next to the photos. */
export function stashVideo(id: string, uri: string): string {
  const dir = folder(id);
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, "walk.mp4");
  if (dest.exists) dest.delete();
  new File(uri).copySync(dest);
  return dest.uri;
}

export async function enqueue(item: QueueItem) {
  const q = await getQueue();
  await save([...q.filter((x) => x.id !== item.id), item]);
}

export async function discard(id: string) {
  try { const d = folder(id); if (d.exists) d.delete(); } catch { /* already gone */ }
  const q = await getQueue();
  await save(q.filter((x) => x.id !== id));
}

// ---------- sending ----------
const NETWORK = /network|fetch|timed? ?out|timeout|abort|connection|offline|unreachable|socket|jwt|token|401/i;
const clean = (m: string) => m.replace(/^[A-Z_]+:\s*/, "");

/** Upload one file. Returns null when it's there (now or from an earlier try). */
async function put(bucket: string, path: string, uri: string, type: string, what: string): Promise<Outcome | null> {
  let bytes: ArrayBuffer;
  try {
    bytes = await new File(uri).arrayBuffer();
  } catch {
    return { kind: "failed", error: `The ${what} for this visit is missing from the phone. Discard it and do the visit again.` };
  }
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: type });
  if (!error) return null;
  const status = String((error as { statusCode?: string | number }).statusCode ?? "");
  if (status === "409" || /exists|duplicate/i.test(error.message)) return null;
  if (NETWORK.test(error.message) || status === "" || status.startsWith("5")) return { kind: "waiting" };
  return { kind: "failed", error: `Upload failed: ${error.message}` };
}

async function verify(fn: string, body: Record<string, string>, id: string): Promise<Outcome> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    if (error instanceof FunctionsFetchError) return { kind: "uploaded" };
    if (error instanceof FunctionsHttpError) {
      const status = (error.context as Response | undefined)?.status ?? 0;
      if (status === 401 || status >= 500) return { kind: "uploaded" };
      const res = await (error.context as Response).json().catch(() => null);
      return { kind: "failed", error: res?.error ?? "The server couldn't check this one." };
    }
    return { kind: "uploaded" };
  }
  await discard(id);
  return { kind: "done", result: data as VerifyResult };
}

async function sendPlot(item: QueueItem): Promise<Outcome> {
  if (item.stage === "upload") {
    const beacons = item.beacons ?? [];
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < beacons.length; i++) {
      let photoPath: string | null = null;
      if (item.photos[i]) {
        photoPath = `${item.propertyId}/${item.id}/${i + 1}.jpg`;
        const bad = await put("plot-photos", photoPath, item.photos[i], "image/jpeg", "beacon photos");
        if (bad) return bad;
      }
      rows.push({ ...beacons[i], photo_path: photoPath });
    }
    const { error: vErr } = await supabase.from("plot_visits").insert({ ...item.row, uploaded_device_time: new Date().toISOString() });
    if (vErr && vErr.code !== "23505") {
      if (NETWORK.test(vErr.message) || !vErr.code) return { kind: "waiting" };
      return { kind: "failed", error: clean(vErr.message) };
    }
    const { error: bErr } = await supabase.from("beacon_checks").insert(rows);
    if (bErr && bErr.code !== "23505") {
      if (NETWORK.test(bErr.message) || !bErr.code) return { kind: "waiting" };
      return { kind: "failed", error: clean(bErr.message) };
    }
    await update(item.id, { stage: "verify", failed: null });
  }
  return verify("verify-plot-visit", { visit_id: item.id }, item.id);
}

async function send(item: QueueItem): Promise<Outcome> {
  if (item.kind === "plot") return sendPlot(item);
  if (item.stage === "upload") {
    const paths: string[] = [];
    for (let i = 0; i < item.photos.length; i++) {
      const path = `${item.propertyId}/${item.id}/${i + 1}.jpg`;
      let bytes: ArrayBuffer;
      try {
        bytes = await new File(item.photos[i]).arrayBuffer();
      } catch {
        return { kind: "failed", error: "The photos for this check-in are missing from the phone. Discard it and check in again." };
      }
      const { error } = await supabase.storage.from("checkins").upload(path, bytes, { contentType: "image/jpeg" });
      if (error) {
        const status = String((error as { statusCode?: string | number }).statusCode ?? "");
        const already = status === "409" || /exists|duplicate/i.test(error.message);
        if (!already) {
          if (NETWORK.test(error.message) || status === "" || status.startsWith("5")) return { kind: "waiting" };
          return { kind: "failed", error: `Photo upload failed: ${error.message}` };
        }
      }
      paths.push(path);
    }

    let videoPath: string | null = null;
    if (item.video) {
      const path = `${item.propertyId}/${item.id}/walk.mp4`;
      let bytes: ArrayBuffer;
      try {
        bytes = await new File(item.video).arrayBuffer();
      } catch {
        return { kind: "failed", error: "The video for this check-in is missing from the phone. Discard it and check in again." };
      }
      const { error } = await supabase.storage.from("checkin-videos").upload(path, bytes, { contentType: "video/mp4" });
      if (error) {
        const status = String((error as { statusCode?: string | number }).statusCode ?? "");
        const already = status === "409" || /exists|duplicate/i.test(error.message);
        if (!already) {
          if (NETWORK.test(error.message) || status === "" || status.startsWith("5")) return { kind: "waiting" };
          return { kind: "failed", error: `Video upload failed: ${error.message}` };
        }
      }
      videoPath = path;
    }

    const { error } = await supabase.from("checkins").insert({
      ...item.row,
      video_path: videoPath,
      photo_paths: paths,
      uploaded_device_time: new Date().toISOString(),
    });
    if (error && error.code !== "23505") {           // 23505: already inserted on an earlier try
      if (NETWORK.test(error.message) || !error.code) return { kind: "waiting" };
      return { kind: "failed", error: clean(error.message) };
    }
    await update(item.id, { stage: "verify", failed: null });
  }

  // 401 (expired sign-in) or 5xx (NIPOST down): retried later.
  return verify("verify-checkin", { checkin_id: item.id }, item.id);
}

let running: Promise<void> | null = null;

/** Send one item now (used right after the reporter taps submit). */
export async function sendNow(id: string): Promise<Outcome> {
  if (running) await running.catch(() => {});
  const item = (await getQueue()).find((x) => x.id === id);
  if (!item) return { kind: "failed", error: "Check-in not found on this phone." };
  const out = await send(item).catch((e): Outcome => (NETWORK.test(String(e)) ? { kind: "waiting" } : { kind: "failed", error: String(e) }));
  if (out.kind === "failed") await update(id, { failed: out.error });
  return out;
}

/** Try everything that's waiting. Stops at the first sign there's no signal. */
export function processQueue(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const q = await getQueue();
    for (const item of q.filter((x) => !x.failed)) {
      const out = await send(item).catch((): Outcome => ({ kind: "waiting" }));
      if (out.kind === "failed") await update(item.id, { failed: out.error });
      if (out.kind === "waiting") break;
    }
  })().finally(() => { running = null; });
  return running;
}

export async function retry(id: string) {
  await update(id, { failed: null });
  return sendNow(id);
}
