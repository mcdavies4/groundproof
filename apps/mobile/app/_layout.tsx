import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { c } from "@/lib/theme";

export default function Layout() {
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
