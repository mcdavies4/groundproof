import { useCallback, useState } from "react";
import { Alert, FlatList, Linking, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { c, s } from "@/lib/theme";
import { Button, Plate } from "@/lib/ui";

type Row = { id: string; label: string; postcode: string | null; anchored_at: string | null; anchor_mode: string | null };

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://groundproof-sigma.vercel.app";

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
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("property_members")
      .select("properties(id, label, postcode, anchored_at, anchor_mode)")
      .eq("user_id", user.user?.id ?? "")
      .eq("role", "reporter");
    setRows((data ?? []).map((r: any) => r.properties).filter(Boolean));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
            onPress={() => router.push(`/checkin/${item.id}`)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? "#e9ece7" : c.white, borderWidth: 1, borderColor: c.concrete,
              borderRadius: 4, padding: 16, marginBottom: 12, gap: 10,
            })}
          >
            <Text style={[s.body, { fontWeight: "700", fontSize: 18 }]}>{item.label}</Text>
            {item.postcode ? (
              <Plate code={item.postcode} />
            ) : (
              <Text style={s.muted}>{item.anchor_mode === "coordinates" ? "Anchored by location" : "Postcode not set yet"}</Text>
            )}
            <Text style={s.muted}>
              {item.anchored_at
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
