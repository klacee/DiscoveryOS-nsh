// The emoji reactions a user puts on posts, and the quick emoji bar. Both are kept only in this
// app's storage (the forum has no reactions), so they show only on this machine. A reaction is
// per post, keyed by the post's id; the bar's counts come from the picks made here.
import { Storage, signal } from "nsh";
import { initialQuickBar, quickBarFromStorage, recordUse, type QuickBar } from "./emojiLfu";

const QUICK_KEY = "quickEmojis";
const REACTIONS_KEY = "reactions";

/** The post whose emoji picker is open, or null. Its post stays highlighted while the picker is up. */
export const pickerOpenOn = signal<string | null>(null);
export const quickBar = signal<QuickBar>(initialQuickBar());
/** The reactions the user put on each post, by post id. */
export const reactions = signal<Record<string, string[]>>({});
// Set once a change is made in this run, so a read from storage that finishes late does not
// overwrite a newer value (the same guard as the favorites).
let quickChanged = false;
let reactionsChanged = false;

Storage.getItem(QUICK_KEY)
  .then((saved) => {
    if (quickChanged || !saved) return;
    quickBar.set(quickBarFromStorage(JSON.parse(saved)));
  })
  .catch(() => undefined);

Storage.getItem(REACTIONS_KEY)
  .then((saved) => {
    if (reactionsChanged || !saved) return;
    const value = JSON.parse(saved);
    if (!value || typeof value !== "object") return;
    const out: Record<string, string[]> = {};
    for (const [pid, list] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(list)) {
        const emojis = list.filter((e): e is string => typeof e === "string" && e.length > 0);
        if (emojis.length > 0) out[pid] = emojis;
      }
    }
    reactions.set(out);
  })
  .catch(() => undefined);

/** The quick bar's emojis, in order. */
export const quickEmojis = () => quickBar().bar;

/** The emojis the user put on a post. */
export const reactionsOn = (pid: string) => reactions()[pid] ?? [];

/**
 * Puts the user's reaction on a post, or takes it off when it is already there. A reaction put on
 * counts toward the quick bar.
 */
export function toggleReaction(pid: string, emoji: string) {
  const current = reactionsOn(pid);
  const next = { ...reactions() };
  if (current.includes(emoji)) {
    const left = current.filter((e) => e !== emoji);
    if (left.length > 0) next[pid] = left;
    else delete next[pid];
  } else {
    next[pid] = [...current, emoji];
    quickBar.set(recordUse(quickBar(), emoji));
    quickChanged = true;
    Storage.setItem(QUICK_KEY, JSON.stringify(quickBar())).catch(() => undefined);
  }
  reactions.set(next);
  reactionsChanged = true;
  Storage.setItem(REACTIONS_KEY, JSON.stringify(next)).catch(() => undefined);
}
