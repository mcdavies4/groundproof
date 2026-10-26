import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Linking, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { c, s } from "@/lib/theme";
import { Button, Plate } from "@/lib/ui";
import { readCache, writeCache } from "@/lib/cache";
import { discard, processQueue, retry, subscribe, type QueueItem } from "@/lib/queue";
import { syncReminders, type OpenRequest } from "@/lib/reminders";

type Row = {
  id: string; label: string; postcode: string | null; anchored_at: string | null; anchor_mode: string | null;
  kind?: "building" | "plot"; estates?: { name: string } | null;
};
type Saved = { rows: Row[]; requests: OpenRequest[]; at: string };

const dueText = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const timeText = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://groundproof.site";

function confirmDelete() {
  Alert.alert(
    "Delete your account?",
    "This permanently deletes your account. Check-ins you made stay in the owners' history, no longer linked to you. This can't be undone.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.functions.invoke("delete-account", { body: {} });
          if (error) {
            Alert.alert("Couldn't delete your account", "Try again, or email us from the website.");
            return;
          }
          await supabase.auth.signOut();
          router.replace("/");
        },
      },
    ],
  );
}

export default function Properties() {
  const [rows, setRows] = useState<Row[]>([]);
  const [requests, setRequests] = useState<OpenRequest[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribe(setQueue), []);

  const load = useCallback(async () => {
    setLoading(true);
    // getSession reads the phone's copy, so this works with no signal.
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error: listErr } = await supabase
      .from("property_members")
      .select("properties(id, label, postcode, anchored_at, anchor_mode, kind, estates(name))")
      .eq("user_id", session?.user.id ?? "")
      .eq("role", "reporter");

    if (listErr) {
      // No signal: show the last list we had.
      const saved = await readCache<Saved>("properties");
      if (saved) { setRows(saved.rows); setRequests(saved.requests); setOfflineSince(saved.at); }
      else setOfflineSince(new Date().toISOString());
      setLoading(false);
      return;
    }

    const list: Row[] = (data ?? []).map((r: any) => r.properties).filter(Boolean);
    let open: OpenRequest[] = [];
    if (list.length) {
      const { data: reqs } = await supabase
        .from("checkin_requests")
        .select("id, property_id, note, due_by, audit_of, exclude_reporter")
        .in("property_id", list.map((r) => r.id))
        .is("fulfilled_at", null)
        .is("cancelled_at", null);
      const label = new Map(list.map((r) => [r.id, r.label]));
      // A second-opinion request is for a different reporter: the person who did the original visit never sees it.
      const { data: me } = await supabase.auth.getUser();
      open = (reqs ?? [])
        .filter((r: any) => !r.exclude_reporter || r.exclude_reporter !== me.user?.id)
        .map((r: any) => ({ id: r.id, property_id: r.property_id, note: r.note, due_by: r.due_by, audit_of: r.audit_of, label: label.get(r.property_id) ?? "your property" }));
    }
    setRows(list); setRequests(open); setOfflineSince(null);
    await writeCache("properties", { rows: list, requests: open, at: new Date().toISOString() } satisfies Saved);
    setLoading(false);
    syncReminders(open);
  }, []);

  useFocusEffect(useCallback(() => { processQueue().finally(load); }, [load]));

  async function join() {
    setJoining(true); setError(null);
    const { error } = await supabase.rpc("accept_invite", { p_code: code });
    setJoining(false);
    if (error) { setError(error.message); return; }
    setCode("");
    load();
  }

  return (
    <View style={s.screen}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={s.pad}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ marginBottom: 20, gap: 10 }}>
            {offlineSince && (
              <View style={{ backgroundColor: c.white, borderLeftWidth: 4, borderLeftColor: c.review, padding: 12, marginBottom: 10 }}>
                <Text style={[s.body, { fontWeight: "700" }]}>No signal</Text>
                <Text style={s.muted}>
                  You can still check in. Photos are saved on this phone and upload by themselves when you&apos;re back online.
                </Text>
              </View>
            )}

            {queue.length > 0 && (
              <View style={{ backgroundColor: c.white, borderWidth: 1, borderColor: c.concrete, borderRadius: 4, padding: 14, gap: 10, marginBottom: 10 }}>
                <Text style={[s.body, { fontWeight: "700" }]}>Waiting to upload ({queue.length})</Text>
                {queue.map((q) => (
                  <View key={q.id} style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.concrete }}>
                    <Text style={s.body}>{q.propertyLabel}</Text>
                    <Text style={s.muted}>
                      Taken {timeText(q.takenAt)}.{" "}
                      {q.failed ? "" : q.stage === "verify" ? "Uploaded, waiting for NIPOST." : "Will upload when there's signal."}
                    </Text>
                    {q.failed && (
                      <>
                        <Text style={[s.error, { marginTop: 0 }]}>{q.failed}</Text>
                        <View style={{ flexDirection: "row", gap: 18 }}>
                          <Pressable onPress={() => retry(q.id).finally(load)} accessibilityRole="button" hitSlop={10}>
                            <Text style={[s.body, { fontWeight: "700", textDecorationLine: "underline" }]}>Try again</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button" hitSlop={10}
                            onPress={() => Alert.alert("Discard this check-in?", "The photos will be deleted from this phone.", [
                              { text: "Keep", style: "cancel" },
                              { text: "Discard", style: "destructive", onPress: () => discard(q.id) },
                            ])}
                          >
                            <Text style={{ color: c.flagged, fontSize: 16, textDecorationLine: "underline" }}>Discard</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ))}
                {queue.some((q) => !q.failed) && <Button title="Upload now" secondary onPress={() => processQueue().finally(load)} />}
              </View>
            )}

            <Text style={s.h2}>Join a property</Text>
            <TextInput
              style={[s.input, { letterSpacing: 3, fontWeight: "700" }]} value={code} onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="Invite code" autoCapitalize="characters" maxLength={8}
            />
            <Button title="Join" onPress={join} busy={joining} disabled={code.length < 8} secondary />
            {error && <Text style={s.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={!loading ? <Text style={s.muted}>No properties yet. Ask the owner for an invite code.</Text> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(item.kind === "plot" ? `/plot/${item.id}` : `/checkin/${item.id}`)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#e9ece7" : c.white, borderWidth: 1, borderColor: c.concrete,
              borderRadius: 4, padding: 16, marginBottom: 12, gap: 10,
            })}
          >
            {item.estates?.name ? <Text style={s.muted}>{item.estates.name}</Text> : null}
            <Text style={[s.body, { fontWeight: "700", fontSize: 18 }]}>{item.label}</Text>
            {requests.filter((r) => r.property_id === item.id).map((r) => (
              <View key={r.id} style={{ backgroundColor: "#fdf6dc", borderLeftWidth: 4, borderLeftColor: c.plate, padding: 10, gap: 2 }}>
                <Text style={[s.body, { fontWeight: "700" }]}>{r.audit_of ? "Second opinion requested" : "Visit requested"}{r.due_by ? ` by ${dueText(r.due_by)}` : ""}</Text>
                {r.note ? <Text style={s.muted}>{r.note}</Text> : null}
              </View>
            ))}
            {item.kind === "plot" ? null : item.postcode ? (
              <Plate code={item.postcode} />
            ) : (
              <Text style={s.muted}>{item.anchor_mode === "coordinates" ? "Anchored by location" : "Postcode not set yet"}</Text>
            )}
            <Text style={s.muted}>
              {item.kind === "plot"
                ? "Plot visit: walk to each survey beacon. Works with no signal."
                : item.anchored_at
                ? "Tap to check in"
                : item.postcode
                  ? "Anchor visit needed. Do it at the house."
                  : "First visit: find the postcode and anchor it. Do it at the house."}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={{ marginTop: 24, gap: 12 }}>
            <Button title="Sign out" secondary onPress={async () => { await supabase.auth.signOut(); router.replace("/"); }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <Pressable onPress={() => Linking.openURL(`${SITE}/privacy`)} accessibilityRole="link" hitSlop={10}>
                <Text style={[s.muted, { textDecorationLine: "underline" }]}>Privacy policy</Text>
              </Pressable>
              <Pressable onPress={confirmDelete} accessibilityRole="button" hitSlop={10}>
                <Text style={{ color: c.flagged, fontSize: 15, textDecorationLine: "underline" }}>Delete my account</Text>
              </Pressable>
            </View>
          </View>
        }
      />
    </View>
  );
}
