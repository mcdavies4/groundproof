/** Last good copy of server data, so the app still works at a site with no signal. */
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`gp.cache.${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(`gp.cache.${key}`, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app still works online.
  }
}
