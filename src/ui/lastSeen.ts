// The floor the user last read to in each thread, kept in the app's storage on this device so a
// thread opens at it again. One entry per thread (keyed by its id), newest first by `at`, capped at
// LIMIT entries. Kept apart from the history: clearing the history does not clear reading positions.
import { Storage } from "nsh";

const KEY = "lastSeen";
const LIMIT = 200;

/** The furthest floor read in a thread: its reply id and floor number, and when it was recorded (ms since the epoch). */
export interface SeenPlace {
  pid: string;
  seq: number;
  at: number;
}

export type SeenStore = Record<string, SeenPlace>;

/** Keeps only the well-formed entries; anything else in storage is dropped. */
export function seenFromStorage(value: unknown): SeenStore {
  const out: SeenStore = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [tid, v] of Object.entries(value as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const p = v as Partial<SeenPlace>;
    if (typeof p.pid !== "string" || typeof p.seq !== "number" || typeof p.at !== "number") continue;
    out[tid] = { pid: p.pid, seq: p.seq, at: p.at };
  }
  return out;
}

/**
 * The store with `place` recorded for thread `tid`. A place only moves forward: a floor not past
 * the one kept is ignored, so scrolling back up never moves the position back. Over LIMIT, the
 * entries recorded longest ago are dropped.
 */
export function withSeen(store: SeenStore, tid: string, place: { pid: string; seq: number }, now: number = Date.now()): SeenStore {
  const kept = store[tid];
  if (kept && kept.seq >= place.seq) return store;
  const next: SeenStore = { ...store, [tid]: { pid: place.pid, seq: place.seq, at: now } };
  const tids = Object.keys(next);
  if (tids.length <= LIMIT) return next;
  const newest = tids.sort((a, b) => next[b].at - next[a].at).slice(0, LIMIT);
  const out: SeenStore = {};
  for (const t of newest) out[t] = next[t];
  return out;
}

// Every read and write goes through one chain, so a save never reads a store another save is still writing.
let chain: Promise<SeenStore> = Storage.getItem(KEY)
  .then((text) => seenFromStorage(text ? JSON.parse(text) : null))
  .catch(() => ({}));

/** The place last read to in thread `tid`, or null when none is saved. */
export function loadLastSeen(tid: string): Promise<SeenPlace | null> {
  return chain.then((store) => store[tid] ?? null);
}

/** Records `place` as read to in thread `tid`, if it is past the place kept. Failures are ignored: the position is a convenience. */
export function saveLastSeen(tid: string, place: { pid: string; seq: number }): Promise<void> {
  chain = chain.then((store) => {
    const next = withSeen(store, tid, place);
    if (next !== store) Storage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
    return next;
  });
  return chain.then(() => undefined);
}
