/**
 * Plot visit: walk to each survey beacon, photograph the pillar, and let Groundproof compare
 * where the beacons really are with where the survey plan puts them. Works with no signal:
 * everything is saved on the phone and uploads later.
 */
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { c, s } from "@/lib/theme";
import { Button } from "@/lib/ui";
import { readCache, writeCache } from "@/lib/cache";
import { discard, enqueue, sendNow, stashPhotos } from "@/lib/queue";

type Beacon = { label: string; lat: number; lng: number };
type Plot = { id: string; label: string; beacons: Beacon[] };
type Fix = { lat: number; lng: number; accuracy: number; mocked: boolean; time: string };
type Check = Fix & { found: boolean; photo: string | null };

const TITLE: Record<string, string> = {
  match: "Plot matches the survey plan", partial: "Needs a closer look", mismatch: "Doesn't match the plan",
  flagged: "Flagged", pending: "Saved on your phone",
};
const COLOUR: Record<string, string> = { match: c.verified, partial: c.review, mismatch: c.flagged, flagged: c.flagged, pending: c.inkSoft };

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function direction(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  const deg = (Math.atan2(y, x) / r + 360) % 360;
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(deg / 45) % 8];
}
const fixOf = (l: Location.LocationObject): Fix => ({
  lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? 999,
  mocked: Boolean((l as { mocked?: boolean }).mocked), time: new Date(l.timestamp).toISOString(),
});

export default function PlotVisit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plot, setPlot] = useState<Plot | null>(null);
  const [offline, setOffline] = useState(false);
  const [here, setHere] = useState<Fix | null>(null);
  const [checks, setChecks] = useState<(Check | null)[]>([]);
  const [active, setActive] = useState<number | null>(null);    // beacon being photographed
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ verdict: string; reason: string } | null>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [locOk, setLocOk] = useState<boolean | null>(null);
  const cam = useRef<CameraView>(null);
  const recent = useRef<Fix[]>([]);

  useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase.from("properties").select("id, label, beacons").eq("id", id).single();
      if (e || !data) {
        const saved = await readCache<Plot>(`plot.${id}`);
        if (cancelled) return;
        setOffline(true);
        if (saved) { setPlot(saved); setChecks(saved.beacons.map(() => null)); }
        else setError("No signal, and this plot hasn't been opened on this phone before. Open it once with signal first.");
      } else {
        const p = data as Plot;
        setPlot(p); setChecks(p.beacons.map(() => null));
        writeCache(`plot.${id}`, p);
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocOk(status === "granted");
      if (status === "granted" && !cancelled) {
        watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest, distanceInterval: 1 }, (l) => {
          const f = fixOf(l);
          setHere(f);
          recent.current = [...recent.current.filter((x) => Date.now() - Date.parse(x.time) < 8000), f];
        });
        if (cancelled) watcher.remove();
      }
    })();
    return () => { cancelled = true; watcher?.remove(); };
  }, [id]);

  /** Best GPS fix from the last few seconds plus a fresh one. */
  async function bestFix(): Promise<Fix> {
    const fresh = fixOf(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }));
    return [...recent.current, fresh].sort((a, b) => a.accuracy - b.accuracy)[0];
  }

  async function capture(i: number) {
    if (!cam.current) return;
    setBusy(true); setError(null);
    try {
      const [photo, fix] = await Promise.all([cam.current.takePictureAsync({ quality: 0.8, exif: false }), bestFix()]);
      if (!photo) throw new Error("No photo captured");
      const ctx = ImageManipulator.manipulate(photo.uri);
      ctx.resize({ width: 1400 });
      const small = await (await ctx.renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
      setChecks((prev) => prev.map((x, j) => (j === i ? { ...fix, found: true, photo: small.uri } : x)));
      setActive(null);
    } catch (e) {
      setError(`Couldn't take the photo: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function notFound(i: number) {
    setBusy(true);
    try {
      const fix = await bestFix();
      setChecks((prev) => prev.map((x, j) => (j === i ? { ...fix, found: false, photo: null } : x)));
    } catch {
      setError("Couldn't read your location. Step into the open and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!plot) return;
    setBusy(true); setError(null);
    const visitId = Crypto.randomUUID();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("You've been signed out. Sign in again, then send the visit.");
      const done = checks as Check[];
      const photos = stashPhotos(visitId, done.map((x) => x.photo ?? ""));
      await enqueue({
        kind: "plot",
        id: visitId,
        propertyId: plot.id,
        propertyLabel: plot.label,
        takenAt: done[0].time,
        photos,
        stage: "upload",
        failed: null,
        row: {
          id: visitId, property_id: plot.id, reporter_id: session.user.id, device_time: done[0].time,
          is_emulator: !Device.isDevice, note: note.trim() || null,
          device_info: { brand: Device.brand, model: Device.modelName, os: `${Device.osName} ${Device.osVersion}` },
        },
        beacons: done.map((x, i) => ({
          visit_id: visitId, property_id: plot.id, beacon_index: i, found: x.found,
          lat: x.lat, lng: x.lng, accuracy_m: x.accuracy, is_mocked: x.mocked, taken_at: x.time,
        })),
      });
      const out = await sendNow(visitId);
      if (out.kind === "done") setResult({ verdict: out.result.verdict, reason: out.result.reason });
      else if (out.kind === "waiting") setResult({ verdict: "pending", reason: "No signal right now. The visit is saved on your phone and uploads by itself when you're back online." });
      else if (out.kind === "uploaded") setResult({ verdict: "pending", reason: "Uploaded. The result will be with the owner shortly." });
      else { await discard(visitId); setError(out.error); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <View style={[s.screen, s.pad, { gap: 16 }]}>
        <Text style={[s.h1, { color: COLOUR[result.verdict] ?? c.ink }]}>{TITLE[result.verdict] ?? "Sent"}</Text>
        <Text style={s.body}>{result.reason}</Text>
        <Button title="Done" onPress={() => router.back()} />
      </View>
    );
  }
  if (!plot) return <View style={[s.screen, s.pad]}>{error && <Text style={s.body}>{error}</Text>}</View>;
  if (locOk === false || !camPerm?.granted) {
    return (
      <View style={[s.screen, s.pad, { gap: 16 }]}>
        <Text style={s.h2}>Camera and location are needed</Text>
        <Text style={s.body}>A plot visit records where each beacon really is, with a photo of the pillar.</Text>
        {!camPerm?.granted && <Button title="Allow camera" onPress={requestCam} />}
        {locOk === false && <Text style={s.muted}>Turn on location for Groundproof in your phone&apos;s settings, then come back.</Text>}
      </View>
    );
  }

  const doneCount = checks.filter(Boolean).length;
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 14 }]}>
      <Text style={s.h2}>{plot.label}</Text>
      <Text style={s.body}>
        Walk to each beacon on the survey plan. Stand right next to the pillar, then photograph it close up with its number showing.
        If a beacon isn&apos;t there, mark it as not found.
      </Text>
      {offline && <Text style={[s.muted, { borderLeftWidth: 4, borderLeftColor: c.review, paddingLeft: 10 }]}>No signal. That&apos;s fine: the visit uploads when you&apos;re back online.</Text>}
      {here && <Text style={s.muted}>Your GPS: ±{Math.round(here.accuracy)} m{here.accuracy > 15 ? ". Weak: move into the open and wait a moment." : ""}</Text>}

      {plot.beacons.map((b, i) => {
        const done = checks[i];
        const d = here ? distance(here, b) : null;
        return (
          <View key={i} style={{ backgroundColor: c.white, borderWidth: 1, borderColor: done ? (done.found ? c.verified : c.review) : c.concrete, borderRadius: 4, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[s.body, { fontWeight: "800", fontSize: 18 }]}>{b.label}</Text>
              {done && <Text style={{ color: done.found ? c.verified : c.review, fontWeight: "700" }}>{done.found ? "Done" : "Not found"}</Text>}
            </View>
            {!done && d !== null && (
              <Text style={s.body}>{d < 4 ? "You're at it." : `${d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(1) + " km"} ${direction(here!, b)}`}</Text>
            )}
            {done?.photo && <Image source={{ uri: done.photo }} style={{ width: 96, height: 128, borderRadius: 2 }} accessibilityLabel={`Photo of ${b.label}`} />}

            {active === i ? (
              <>
                <View style={{ borderRadius: 4, overflow: "hidden", aspectRatio: 3 / 4, backgroundColor: "#000" }}>
                  <CameraView ref={cam} style={{ flex: 1 }} facing="back" />
                </View>
                <Button title={`Photograph ${b.label}`} onPress={() => capture(i)} busy={busy} />
                <Button title="Cancel" secondary onPress={() => setActive(null)} />
              </>
            ) : done ? (
              <Pressable onPress={() => setChecks((prev) => prev.map((x, j) => (j === i ? null : x)))} hitSlop={10} accessibilityRole="button">
                <Text style={[s.muted, { textDecorationLine: "underline" }]}>Redo this beacon</Text>
              </Pressable>
            ) : (
              <View style={{ gap: 8 }}>
                <Button title={`I'm at ${b.label}`} onPress={() => setActive(i)} disabled={active !== null} />
                <Button title="Can't find it" secondary onPress={() => notFound(i)} disabled={active !== null || busy} />
              </View>
            )}
          </View>
        );
      })}

      <TextInput
        style={[s.input, { minHeight: 80, paddingTop: 12, textAlignVertical: "top" }]}
        value={note} onChangeText={setNote} multiline maxLength={500}
        placeholder="Anything the buyer should know? Fences, buildings, people on the land, disputes…"
      />
      <Button title={`Send plot visit (${doneCount} of ${plot.beacons.length})`} onPress={submit} busy={busy} disabled={doneCount < plot.beacons.length || active !== null} />
      {error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  );
}
