import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import * as Crypto from "expo-crypto";
import { decode } from "base64-arraybuffer";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { c, s } from "@/lib/theme";
import { Button, Plate, verdictColour, verdictLabel } from "@/lib/ui";

const MAX_PHOTOS = 4;
const ANCHOR_PHOTOS = 4;

type Property = { id: string; label: string; postcode: string; anchored_at: string | null };
type Milestone = { id: string; name: string; completed_checkin_id: string | null };
type Shot = { uri: string; lat: number; lng: number; accuracy: number; mocked: boolean; time: string };
type Result = { verdict: keyof typeof verdictLabel; reason: string };

export default function CheckIn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
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
  const cam = useRef<CameraView>(null);

  const isAnchor = property !== null && !property.anchored_at;
  const needed = isAnchor ? ANCHOR_PHOTOS : 1;

  useEffect(() => {
    let watcher: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const [{ data: p }, { data: m }] = await Promise.all([
        supabase.from("properties").select("id, label, postcode, anchored_at").eq("id", id).single(),
        supabase.from("milestones").select("id, name, completed_checkin_id").eq("property_id", id).order("sort"),
      ]);
      setProperty(p as Property);
      setMilestones((m ?? []) as Milestone[]);
      if (p?.anchored_at) {
        const { data: reason } = await supabase.rpc("checkin_block_reason", { pid: id });
        if (!cancelled) setBlocked((reason as string | null) ?? null);
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
      const [photo, loc] = await Promise.all([
        cam.current.takePictureAsync({ quality: 0.6, exif: false }),
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
      ]);
      if (!photo) throw new Error("No photo captured");
      setShots((prev) => [
        ...prev,
        {
          uri: photo.uri,
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

  async function submit() {
    if (!property) return;
    setSubmitting(true); setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const checkinId = Crypto.randomUUID();

      // Use the most accurate fix among the photos; any mocked fix taints the check-in.
      const best = [...shots].sort((a, b) => a.accuracy - b.accuracy)[0];
      const mocked = shots.some((x) => x.mocked);

      const paths: string[] = [];
      for (let i = 0; i < shots.length; i++) {
        const b64 = await FileSystem.readAsStringAsync(shots[i].uri, { encoding: FileSystem.EncodingType.Base64 });
        const path = `${property.id}/${checkinId}/${i + 1}.jpg`;
        const { error: upErr } = await supabase.storage.from("checkins").upload(path, decode(b64), { contentType: "image/jpeg" });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`);
        paths.push(path);
      }

      const { error: insErr } = await supabase.from("checkins").insert({
        id: checkinId,
        property_id: property.id,
        reporter_id: auth.user!.id,
        milestone_id: isAnchor ? null : milestoneId,
        is_anchor: isAnchor,
        lat: best.lat,
        lng: best.lng,
        gps_accuracy_m: best.accuracy,
        is_mocked: mocked,
        device_time: shots[0].time,
        photo_paths: paths,
        note: note.trim() || null,
      });
      if (insErr) throw new Error(insErr.message.replace(/^[A-Z_]+:\s*/, ""));

      const { data, error: fnErr } = await supabase.functions.invoke("verify-checkin", { body: { checkin_id: checkinId } });
      if (fnErr) {
        setResult({ verdict: "pending", reason: "Saved. NIPOST didn't answer yet, so the owner will see this once it's checked." });
      } else {
        setResult(data as Result);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!property) return <View style={s.screen} />;

  if (result) {
    return (
      <View style={[s.screen, s.pad, { gap: 16 }]}>
        <Text style={[s.h1, { color: verdictColour[result.verdict] }]}>{verdictLabel[result.verdict]}</Text>
        <Text style={s.body}>{result.reason}</Text>
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
        <Plate code={property.postcode} />
      </View>

      {isAnchor ? (
        <Text style={s.body}>
          Anchor visit. Stand outside the building and take {ANCHOR_PHOTOS} photos: front, left side, right side, and the street.
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

      {shots.length < MAX_PHOTOS && (
        <View style={{ borderRadius: 4, overflow: "hidden", aspectRatio: 3 / 4, backgroundColor: "#000" }}>
          <CameraView ref={cam} style={{ flex: 1 }} facing="back" />
        </View>
      )}
      {shots.length < MAX_PHOTOS && (
        <Button title={`Take photo ${shots.length + 1}${isAnchor ? ` of ${ANCHOR_PHOTOS}` : ""}`} onPress={takePhoto} busy={capturing} />
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
        disabled={shots.length < needed}
      />
      {error && <Text style={s.error}>{error}</Text>}
    </ScrollView>
  );
}
