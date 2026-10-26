/**
 * Local reminders for check-in requests. No push server needed: when the app sees an open
 * request it schedules reminders on the phone (next morning, the day after, and 4 days on),
 * and cancels them once the request is answered or cancelled.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export type OpenRequest = { id: string; property_id: string; label: string; note: string | null; due_by: string | null; audit_of?: string | null };

const DAYS = [1, 2, 4];

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Visit reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
}

function nineAm(daysAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(9, 0, 0, 0);
  return d;
}

export async function syncReminders(open: OpenRequest[]) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const wanted = new Set(open.map((r) => r.id));
    const have = new Set<string>();
    for (const n of scheduled) {
      const data = n.content.data as { kind?: string; requestId?: string } | undefined;
      if (data?.kind !== "request" || !data.requestId) continue;
      if (wanted.has(data.requestId)) have.add(data.requestId);
      else await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }

    const fresh = open.filter((r) => !have.has(r.id));
    if (!fresh.length) return;

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return;   // they'll still see the request in the app

    for (const r of fresh) {
      for (const days of DAYS) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Visit requested: ${r.label}`,
            body: r.note ? r.note : "The owner is waiting for a check-in. Open Groundproof at the property.",
            data: { kind: "request", requestId: r.id, propertyId: r.property_id },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nineAm(days), channelId: "reminders" },
        });
      }
    }
  } catch {
    // Reminders are a nice-to-have; never block the app on them.
  }
}
