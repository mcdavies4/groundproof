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
import { Button, Plate, verdictColour, verdictLabel } from "@/lib/ui";
import { readCache, writeCache } from "@/lib/cache";
import { enqueue, sendNow, stashPhotos, stashVideo, discard } from "@/lib/queue";

const MAX_PHOTOS = 4;
const ANCHOR_PHOTOS = 4;

type Property = { id: string; label: string; postcode: string | null; anchored_at: string | null; require_video?: boolean };
const VIDEO_SECONDS = 15;
type Milestone = { id: string; name: string; completed_checkin_id: string | null };
type Shot = { uri: string; lat: number; lng: number; accuracy: number; mocked: boolean; time: string; heading: number | null };

const ANCHOR_SHOTS = ["the front of the building", "the left side", "the right side", "the street outside"];
const CHECKIN_SHOTS = [
  "the front of the building, standing where the first anchor photo was taken",
  "anything the owner should see",
  "anything else",
  "anything else",
];

/** Compass heading in degrees, or null if the phone can't give one within 3 seconds. */
async function readHeading(): Promise<number | null> {
  try {
    const h = await Promise.race([
      Location.getHeadingAsync(),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ]);
    if (!h) return null;
    const v = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
    return v >= 0 ? Math.round(v * 10) / 10 : null;
  } catch {
    return null;
  }
}
type Result = {
  verdict: keyof typeof verdictLabel; reason: string; note?: string | null; match_type?: "postcode" | "coordinates";
  saved?: boolean;   // kept on the phone for later upload
};
type Find =
  | { status: "idle" | "searching" }
  | { status: "found"; postcode: string; distance_m: number }
  | { status: "not_listed" }
  | { status: "weak_gps"; accuracy: number }
  | { status: "error"; error: string };

export default function CheckIn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [offline, setOffline] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [locPerm, setLocPerm] = useState<boolean | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [note, setNote] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [find, setFind] = useState<Find>({ status: "idle" });
  const [anchorChoice, setAnchorChoice] = useState<"postcode" | "coordinates" | null>(null);
  const [claimedPostcode, setClaimedPostcode] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [camMode, setCamMode] = useState<"picture" | "video">("picture");
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const cam = useRef<CameraView>(null);

  const isAnchor = property !== null && !property.anchored_at;
  const needsFind = isAnchor && !property?.postcode && anchorChoice === null;
  const needed = isAnchor ? ANCHOR_PHOTOS : 1;
  const videoRequired = !isAnchor && Boolean(property?.require_video);
  const showCam = !videoOpen ? shots.length < MAX_PHOTOS : !video;

  async function recordVideo() {
    if (!cam.current) return;
    setError(null);
    setCamMode("video");
    await new Promise((r) => setTimeout(r, 600));          // let the camera switch to video
    setRecording(true); setSecs(0);
    const tick = setInterval(() => setSecs((x) => x + 1), 1000);
    try {
      const r = await cam.current.recordAsync({ maxDuration: VIDEO_SECONDS });
      if (r?.uri) { setVideo(r.uri); setVideoOpen(false); }
    } catch (e) {
      setError(`Couldn't record the video: ${(e as Error).message}`);
    } finally {
      clearInterval(tick);
      setRecording(false);
      setCamMode("picture");
    }
  }

  useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const [{ data: p, error: pErr }, { data: m }] = await Promise.all([
        supabase.from("properties").select("id, label, postcode, anchored_at, require_video").eq("id", id).single(),
        supabase.from("milestones").select("id, name, completed_checkin_id").eq("property_id", id).order("sort"),
      ]);
      if (pErr || !p) {
        // No signal: use the copy saved last time this screen loaded, or the property list's copy.
        const saved = await readCache<{ property: Property; milestones: Milestone[] }>(`property.${id}`);
        const list = await readCache<{ rows: Property[] }>("properties");
        const fallback = saved?.property ?? list?.rows.find((r) => r.id === id) ?? null;
        if (cancelled) return;
        setOffline(true);
        setProperty(fallback);
        setMilestones(saved?.milestones ?? []);
        if (!fallback) setError("No signal, and this property hasn't been opened on this phone before. Try again when you're online.");
      } else {
        setProperty(p as Property);
        setMilestones((m ?? []) as Milestone[]);
        writeCache(`property.${id}`, { property: p, milestones: m ?? [] });
        if (p.anchored_at) {
          const { data: reason } = await supabase.rpc("checkin_block_reason", { pid: id });
          if (!cancelled) setBlocked((reason as string | null) ?? null);
        }
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocPerm(status === "granted");
      if (status === "granted" && !cancelled) {
        // Keep GPS warm while on this screen so fixes are accurate when photos are taken.
        watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Highest }, () => {});
        if (cancelled) watcher.remove();
      }
    })();
    return () => { cancelled = true; watcher?.remove(); };
  }, [id]);

  async function takePhoto() {
    if (!cam.current) return;
    setCapturing(true); setError(null);
    try {
      const [photo, loc, heading] = await Promise.all([
        cam.current.takePictureAsync({ quality: 0.8, exif: false }),
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
        readHeading(),
      ]);
      if (!photo) throw new Error("No photo captured");
      // Resize before upload: clearer for the photo check, and far less mobile data.
      const ctx = ImageManipulator.manipulate(photo.uri);
      ctx.resize({ width: 1600 });
      const rendered = await ctx.renderAsync();
      const small = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
      setShots((prev) => [
        ...prev,
        {
          uri: small.uri,
          heading,
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? 999,
          mocked: Boolean((loc as { mocked?: boolean }).mocked),
          time: new Date(loc.timestamp).toISOString(),
        },
      ]);
    } catch (e) {
      setError(`Couldn't take the photo: ${(e as Error).message}`);
    } finally {
      setCapturing(false);
    }
  }

  async function findBuilding() {
    if (!property) return;
    setFind({ status: "searching" });
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const { data, error: fnErr } = await supabase.functions.invoke("find-postcode", {
        body: { property_id: property.id, lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? 999 },
      });
      if (fnErr || !data?.status) {
        throw new Error(offline
          ? "Finding the postcode needs signal. Move to where you have signal, or come back to this step later. Everything after it works offline."
          : "NIPOST didn't answer. Try again in a minute.");
      }
      setFind(data as Find);
    } catch (e) {
      setFind({ status: "error", error: (e as Error).message });
    }
  }

  async function submit() {
    if (!property) return;
    setSubmitting(true); setError(null);
    const checkinId = Crypto.randomUUID();
    try {
      // Reads the phone's saved sign-in, so it works with no signal.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("You've been signed out. Sign in again, then check in.");

      // Use the most accurate fix among the photos; any mocked fix taints the check-in.
      const best = [...shots].sort((a, b) => a.accuracy - b.accuracy)[0];
      const mocked = shots.some((x) => x.mocked);

      // Save everything on the phone first, so nothing is lost if there's no signal.
      const photos = stashPhotos(checkinId, shots.map((x) => x.uri));
      const videoFile = video ? stashVideo(checkinId, video) : null;
      await enqueue({
        id: checkinId,
        propertyId: property.id,
        propertyLabel: property.label,
        takenAt: shots[0].time,
        photos,
        video: videoFile,
        stage: "upload",
        failed: null,
        row: {
          id: checkinId,
          property_id: property.id,
          reporter_id: session.user.id,
          milestone_id: isAnchor ? null : milestoneId,
          is_anchor: isAnchor,
          anchor_choice: isAnchor && !property.postcode ? anchorChoice : null,
          claimed_postcode: isAnchor && !property.postcode && anchorChoice === "postcode" ? claimedPostcode : null,
          lat: best.lat,
          lng: best.lng,
          gps_accuracy_m: best.accuracy,
          is_mocked: mocked,
          device_time: shots[0].time,
          photo_headings: shots.map((x) => x.heading),
          is_emulator: !Device.isDevice,
          device_info: { brand: Device.brand, model: Device.modelName, os: `${Device.osName} ${Device.osVersion}` },
          note: note.trim() || null,
        },
      });

      const out = await sendNow(checkinId);
      if (out.kind === "done") {
        setResult(out.result as Result);
      } else if (out.kind === "waiting") {
        setResult({
          verdict: "pending", saved: true,
          reason: "No signal right now. This check-in is saved on your phone and uploads by itself when you're back online. Keep Groundproof installed until it's gone from the \"Waiting to upload\" list.",
        });
      } else if (out.kind === "uploaded") {
        setResult({ verdict: "pending", reason: "Uploaded. NIPOST hasn't answered yet, so the app will check again shortly. The owner sees the result as soon as it's in." });
      } else {
        // The server refused it (for example, no check-ins left). Nothing to retry later.
        await discard(checkinId);
        setError(out.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!property) {
    return (
      <View style={[s.screen, s.pad, { gap: 16 }]}>
        {error && <Text style={s.body}>{error}</Text>}
        {error && <Button title="Back" secondary onPress={() => router.back()} />}
      </View>
    );
  }

  if (result) {
    return (
      <View style={[s.screen, s.pad, { gap: 16 }]}>
        <Text style={[s.h1, { color: verdictColour[result.verdict] }]}>
          {result.saved
            ? "Saved on your phone"
            : result.verdict === "verified" && result.match_type === "coordinates" ? "Location match" : verdictLabel[result.verdict]}
        </Text>
        <Text style={s.body}>{result.reason}</Text>
        {result.note ? <Text style={[s.muted, { fontStyle: "italic" }]}>{result.note}</Text> : null}
        <Button title="Done" onPress={() => router.back()} />
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={[s.screen, s.pad, { gap: 16 }]}>
        <Text style={s.h2}>{property.label}</Text>
        <Text style={s.body}>{blocked}</Text>
        <Text style={s.muted}>Once they top up, come back here and check in as normal. Photos aren&apos;t taken until then.</Text>
        <Button title="Back" secondary onPress={() => router.back()} />
      </View>
    );
  }

  if (needsFind && locPerm !== false) {
    return (
      <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 16 }]}>
        <Text style={s.h2}>{property.label}</Text>
        <Text style={s.body}>
          First, find this building&apos;s NIPOST postcode. Stand outside the building, in the open, then tap the button.
        </Text>

        {(find.status === "idle" || find.status === "searching") && (
          <Button title="Find this building" onPress={findBuilding} busy={find.status === "searching"} />
        )}

        {find.status === "found" && (
          <View style={{ gap: 14 }}>
            <Text style={s.body}>NIPOST says you&apos;re standing at:</Text>
            <Plate code={find.postcode} />
            <Text style={s.muted}>{find.distance_m}m away. Is this the building you&apos;re checking in for?</Text>
            <Button title="Yes, this is the building" onPress={() => { setClaimedPostcode(find.postcode); setAnchorChoice("postcode"); }} />
            <Button title="No, it's a different building" secondary onPress={() => setAnchorChoice("coordinates")} />
          </View>
        )}

        {find.status === "not_listed" && (
          <View style={{ gap: 14 }}>
            <Text style={s.body}>
              NIPOST hasn&apos;t listed a building here yet. That&apos;s common for new builds. We&apos;ll lock this property
              to this exact spot instead, and match future check-ins by location.
            </Text>
            <Button title="Continue" onPress={() => setAnchorChoice("coordinates")} />
            <Button title="Search again" secondary onPress={findBuilding} />
          </View>
        )}

        {find.status === "weak_gps" && (
          <View style={{ gap: 14 }}>
            <Text style={s.body}>GPS is too weak right now (±{find.accuracy}m). Step away from walls and roofs, wait a few seconds, and try again.</Text>
            <Button title="Try again" onPress={findBuilding} />
          </View>
        )}

        {find.status === "error" && (
          <View style={{ gap: 14 }}>
            <Text style={s.error}>{find.error}</Text>
            <Button title="Try again" onPress={findBuilding} />
          </View>
        )}
      </ScrollView>
    );
  }

  if (!camPerm?.granted || locPerm === false) {
    return (
      <View style={[s.screen, s.pad, { gap: 16 }]}>
        <Text style={s.h2}>Camera and location are needed</Text>
        <Text style={s.body}>
          Check-ins only count with photos taken in the app and the phone&apos;s location, so the owner can see they came from the property.
        </Text>
        {!camPerm?.granted && <Button title="Allow camera" onPress={requestCam} />}
        {locPerm === false && <Text style={s.muted}>Turn on location for Groundproof in your phone&apos;s settings, then come back.</Text>}
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 16 }]}>
      <View style={{ gap: 8 }}>
        <Text style={s.h2}>{property.label}</Text>
        {property.postcode || claimedPostcode ? (
          <Plate code={(property.postcode ?? claimedPostcode)!} />
        ) : (
          <Text style={s.muted}>Anchoring to this exact spot</Text>
        )}
      </View>

      {offline && (
        <Text style={[s.muted, { borderLeftWidth: 4, borderLeftColor: c.review, paddingLeft: 10 }]}>
          No signal. Take the photos as normal; they upload when you&apos;re back online.
        </Text>
      )}

      {isAnchor ? (
        <Text style={s.body}>
          Anchor visit. Stand outside the building and take {ANCHOR_PHOTOS} photos: front, left side, right side, and the
          street. Remember where you stood for the front photo; every later check-in starts from that spot.
        </Text>
      ) : milestones.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={s.body}>What is this check-in for?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[{ id: null, name: "Routine", completed_checkin_id: null }, ...milestones.filter((m) => !m.completed_checkin_id)].map((m) => {
              const active = milestoneId === m.id;
              return (
                <Pressable
                  key={m.id ?? "routine"}
                  onPress={() => setMilestoneId(m.id)}
                  accessibilityState={{ selected: active }}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 4, borderWidth: 2, borderColor: c.ink, backgroundColor: active ? c.ink : "transparent" }}
                >
                  <Text style={{ color: active ? c.paper : c.ink, fontWeight: "700" }}>{m.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {showCam && (
        <View style={{ borderRadius: 4, overflow: "hidden", aspectRatio: 3 / 4, backgroundColor: "#000" }}>
          <CameraView
            ref={cam} style={{ flex: 1 }} facing="back"
            mode={camMode} mute videoQuality="480p" videoBitrate={1_500_000}
          />
          {recording && (
            <View style={{ position: "absolute", top: 12, left: 12, backgroundColor: c.flagged, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 }}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>● REC {VIDEO_SECONDS - secs}s</Text>
            </View>
          )}
        </View>
      )}
      {!videoOpen && shots.length < MAX_PHOTOS && (
        <Text style={[s.body, { fontWeight: "700" }]}>
          Photo {shots.length + 1}: {(isAnchor ? ANCHOR_SHOTS : CHECKIN_SHOTS)[shots.length]}
        </Text>
      )}
      {!videoOpen && shots.length < MAX_PHOTOS && (
        <Button title={`Take photo ${shots.length + 1}${isAnchor ? ` of ${ANCHOR_PHOTOS}` : ""}`} onPress={takePhoto} busy={capturing} />
      )}

      {!isAnchor && shots.length >= needed && (
        <View style={{ gap: 10, padding: 14, backgroundColor: c.white, borderWidth: 1, borderColor: c.concrete, borderRadius: 4 }}>
          <Text style={[s.body, { fontWeight: "700" }]}>
            Walk-round video {videoRequired ? "(the owner asked for one)" : "(optional)"}
          </Text>
          {video ? (
            <>
              <Text style={s.muted}>Video recorded. It uploads with the photos.</Text>
              <Button title="Record again" secondary onPress={() => { setVideo(null); setVideoOpen(true); }} />
            </>
          ) : !videoOpen ? (
            <>
              <Text style={s.muted}>{VIDEO_SECONDS} seconds, slowly walking along the front of the building. No sound is recorded.</Text>
              <Button title="Record a video" secondary onPress={() => setVideoOpen(true)} />
            </>
          ) : recording ? (
            <Button title="Stop" onPress={() => cam.current?.stopRecording()} />
          ) : (
            <>
              <Button title={`Start ${VIDEO_SECONDS}-second video`} onPress={recordVideo} />
              <Button title="Back to photos" secondary onPress={() => setVideoOpen(false)} />
            </>
          )}
        </View>
      )}

      {shots.length > 0 && (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {shots.map((x, i) => (
            <View key={x.uri}>
              <Image source={{ uri: x.uri }} style={{ width: 96, height: 128, borderRadius: 2 }} accessibilityLabel={`Photo ${i + 1}`} />
              <Text style={[s.muted, { fontSize: 12 }]}>±{Math.round(x.accuracy)}m</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {shots.some((x) => x.accuracy > 20) && (
        <Text style={s.muted}>GPS is weak. Step away from walls and roofs, wait a few seconds, then take another photo.</Text>
      )}

      <TextInput
        style={[s.input, { minHeight: 80, paddingTop: 12, textAlignVertical: "top" }]}
        value={note} onChangeText={setNote} placeholder="Note for the owner (optional)" multiline maxLength={500}
      />

      <Button
        title={isAnchor ? "Submit anchor visit" : "Submit check-in"}
        onPress={submit}
        busy={submitting}
        disabled={shots.length < needed || recording || (videoRequired && !video)}
      />
      {error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  );
}
