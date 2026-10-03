import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { s } from "@/lib/theme";
import { Button } from "@/lib/ui";

export default function SignIn() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (session) return <Redirect href="/properties" />;

  async function sendCode() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  }

  async function verify() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("That code didn't work. Check it, or send a new one.");
  }

  return (
    <KeyboardAvoidingView style={[s.screen, s.pad]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={s.h1}>Check in on a property</Text>
      <Text style={[s.muted, { marginBottom: 24 }]}>
        For people visiting a property on the owner&apos;s behalf. Sign in with your email, then enter the invite code the owner sent you.
      </Text>

      {!sent ? (
        <View style={{ gap: 12 }}>
          <TextInput
            style={s.input} value={email} onChangeText={setEmail} placeholder="Email address"
            autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email"
          />
          <Button title="Send me a code" onPress={sendCode} busy={busy} disabled={!email.includes("@")} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={s.body}>Enter the 6-digit code sent to {email}.</Text>
          <TextInput
            style={[s.input, { fontSize: 24, letterSpacing: 6 }]} value={code} onChangeText={setCode}
            keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode"
          />
          <Button title="Sign in" onPress={verify} busy={busy} disabled={code.length !== 6} />
          <Button title="Use a different email" secondary onPress={() => { setSent(false); setCode(""); }} />
        </View>
      )}
      {error && <Text style={s.error}>{error}</Text>}
    </KeyboardAvoidingView>
  );
}
