import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { s } from "@/lib/theme";
import { Button } from "@/lib/ui";

/** Plain-language reasons the code couldn't be sent, so people know whether to wait, check their signal or tell us. */
function friendly(e: { message: string; status?: number; code?: string }): string {
  const m = e.message.toLowerCase();
  if (m.includes("rate limit") || m.includes("security purposes") || e.status === 429) {
    return "Too many codes have been requested just now. Wait a minute or two, then try again. If it keeps happening, email the36thltd@outlook.com.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("timeout")) {
    return "Couldn't reach Groundproof. Check your data or Wi-Fi and try again.";
  }
  if (m.includes("email") && (m.includes("invalid") || m.includes("valid"))) {
    return "That email address doesn't look right. Check it and try again.";
  }
  return "We couldn't send your code just now. Try again in a minute. If it keeps happening, email the36thltd@outlook.com and tell us the time and your email address.";
}

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
    if (error) setError(friendly(error)); else setSent(true);
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
