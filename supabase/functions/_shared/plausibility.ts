/**
 * Anti-spoofing evidence that needs no special phone API. A faked GPS usually gives itself away
 * by being impossible against what the same reporter did before. These checks only ever move a
 * check-in to "review", never to "flagged": a human looks, nobody is accused by a formula.
 */
import { distanceM } from "./geo.ts";

export interface Fix { lat: number; lng: number; at: number }   // at = ms since epoch, when the photos were taken

const MIN_DISTANCE_M = 20_000;      // ignore short hops, GPS drift and clock error dominate there
const MAX_SPEED_KMH = 250;          // faster than a fast train; no reporter does this between check-ins

/** The reporter's previous check-in is too far away to have reached in the time between them. */
export function impossibleTravel(prev: Fix, cur: Fix): { km: number; minutes: number } | null {
  const hours = (cur.at - prev.at) / 3_600_000;
  if (hours <= 0) return null;                                    // clock oddities are handled elsewhere
  const d = distanceM(prev.lat, prev.lng, cur.lat, cur.lng);
  if (d < MIN_DISTANCE_M) return null;
  if (d / 1000 / hours <= MAX_SPEED_KMH) return null;
  return { km: Math.round(d / 1000), minutes: Math.max(1, Math.round(hours * 60)) };
}
