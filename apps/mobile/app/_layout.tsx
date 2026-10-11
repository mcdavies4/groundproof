import { useEffect } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { c } from "@/lib/theme";
import { processQueue } from "@/lib/queue";
import { setupNotifications } from "@/lib/reminders";

export default function Layout() {
  // Upload any check-ins saved with no signal: on launch, whenever the app comes back
  // to the foreground, and every minute while it's open.
  useEffect(() => {
    setupNotifications();
    processQueue();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") processQueue(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") processQueue(); }, 60_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.paper },
          headerTintColor: c.ink,
          headerTitleStyle: { fontWeight: "800" },
          contentStyle: { backgroundColor: c.paper },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Groundproof" }} />
        <Stack.Screen name="properties" options={{ title: "Your properties", headerBackVisible: false }} />
        <Stack.Screen name="checkin/[id]" options={{ title: "Check in" }} />
      </Stack>
    </>
  );
}
