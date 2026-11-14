// The quick emoji bar, kept by least-frequently-used (LFU). Every emoji picked is counted, and the
// bar holds up to QUICK_CAPACITY emojis. Picking an emoji that is not on the bar takes the place of
// the least-used one on it, once the picked emoji has been used more often than that one.
// The counts are kept for every emoji ever picked, so the bar follows the real usage over time.

export const QUICK_CAPACITY = 4;
/** The bar before anything has been picked. */
export const QUICK_SEED = ["👍", "👌", "✅", "➕"];

export interface QuickBar {
  /** The emojis on the bar, in the order they show. */
  bar: string[];
  /** How many times each emoji has been picked. */
  counts: Record<string, number>;
}

export function initialQuickBar(): QuickBar {
  return { bar: [...QUICK_SEED], counts: {} };
}

/** Counts one pick of `emoji` and returns the bar after it. The input is not changed. */
export function recordUse(state: QuickBar, emoji: string): QuickBar {
  const counts = { ...state.counts, [emoji]: (state.counts[emoji] ?? 0) + 1 };
  let bar = state.bar;
  if (!bar.includes(emoji)) {
    if (bar.length < QUICK_CAPACITY) {
      bar = [...bar, emoji];
    } else {
      // The least-used emoji on the bar; on a tie, the one that comes first.
      let victim = 0;
      for (let i = 1; i < bar.length; i++) {
        if ((counts[bar[i]] ?? 0) < (counts[bar[victim]] ?? 0)) victim = i;
      }
      if (counts[emoji] > (counts[bar[victim]] ?? 0)) {
        bar = bar.map((e, i) => (i === victim ? emoji : e));
      }
    }
  }
  // The bar lists the most-used emojis first. A stable sort keeps the order of emojis tied on count.
  bar = [...bar].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  return { bar, counts };
}

/**
 * Reads a bar saved by an earlier run. Anything not shaped right is dropped; a bar left empty
 * falls back to the seed.
 */
export function quickBarFromStorage(value: unknown): QuickBar {
  if (!value || typeof value !== "object") return initialQuickBar();
  const saved = value as { bar?: unknown; counts?: unknown };
  const bar: string[] = [];
  if (Array.isArray(saved.bar)) {
    for (const e of saved.bar) {
      if (typeof e === "string" && e.length > 0 && !bar.includes(e) && bar.length < QUICK_CAPACITY) bar.push(e);
    }
  }
  const counts: Record<string, number> = {};
  if (saved.counts && typeof saved.counts === "object") {
    for (const [e, n] of Object.entries(saved.counts as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) counts[e] = n;
    }
  }
  return { bar: bar.length > 0 ? bar : [...QUICK_SEED], counts };
}
