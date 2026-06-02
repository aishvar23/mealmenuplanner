import * as SecureStore from "expo-secure-store";

/**
 * Supabase Auth session storage backed by `expo-secure-store` (iOS Keychain /
 * Android Keystore), per design/10 § 3.
 *
 * `expo-secure-store` caps each value at ~2048 bytes, but a Supabase session
 * (access + refresh JWT + user) can exceed that. This adapter transparently
 * **chunks** large values across numbered keys (`<key>.0`, `<key>.1`, …) and
 * stores a small marker under the base key, so the Supabase client sees a normal
 * key/value store with no size limit.
 */

// Leave headroom under the 2048-byte SecureStore limit.
const MAX_CHUNK = 2000;
const CHUNK_MARKER = "__mmp_chunked__:"; // followed by the chunk count

function chunkKey(key: string, i: number): string {
  return `${key}.${i}`;
}

async function clearChunks(key: string, count: number): Promise<void> {
  const deletes: Promise<void>[] = [];
  for (let i = 0; i < count; i += 1) {
    deletes.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  }
  await Promise.all(deletes);
}

/** Parse a marker value into its chunk count, or null if not a marker. */
function markerCount(value: string | null): number | null {
  if (value == null || !value.startsWith(CHUNK_MARKER)) return null;
  const count = Number.parseInt(value.slice(CHUNK_MARKER.length), 10);
  return Number.isFinite(count) ? count : null;
}

async function getItem(key: string): Promise<string | null> {
  const base = await SecureStore.getItemAsync(key);
  const count = markerCount(base);
  if (count === null) return base; // small value stored inline (or absent)

  let out = "";
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    if (part == null) return null; // corrupt/partial — treat as missing
    out += part;
  }
  return out;
}

async function setItem(key: string, value: string): Promise<void> {
  // Clean up any chunks left by a previous larger value under this key.
  const prev = markerCount(await SecureStore.getItemAsync(key));
  if (prev !== null) await clearChunks(key, prev);

  if (value.length <= MAX_CHUNK) {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  const parts: string[] = [];
  for (let i = 0; i < value.length; i += MAX_CHUNK) {
    parts.push(value.slice(i, i + MAX_CHUNK));
  }
  await Promise.all(
    parts.map((part, i) => SecureStore.setItemAsync(chunkKey(key, i), part)),
  );
  await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${parts.length}`);
}

async function removeItem(key: string): Promise<void> {
  const count = markerCount(await SecureStore.getItemAsync(key));
  if (count !== null) await clearChunks(key, count);
  await SecureStore.deleteItemAsync(key);
}

/** Storage adapter conforming to Supabase's `SupportedStorage` interface. */
export const secureStorageAdapter = { getItem, setItem, removeItem };
