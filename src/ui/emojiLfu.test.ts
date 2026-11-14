// The quick emoji bar keeps the most-used emojis (LFU), and reads a saved bar back safely.
import { expect, test } from "nsh/test";
import { initialQuickBar, QUICK_SEED, quickBarFromStorage, recordUse, type QuickBar } from "./emojiLfu";

function pick(state: QuickBar, emojis: string[]): QuickBar {
  return emojis.reduce((s, e) => recordUse(s, e), state);
}

test("the bar starts as the seed emojis", () => {
  expect(initialQuickBar().bar).toEqual(QUICK_SEED);
});

test("picking an emoji on the bar counts it and leaves the bar as it is", () => {
  const next = recordUse(initialQuickBar(), "✅");
  // The picked emoji now has the most uses, so it moves to the front.
  expect(next.bar).toEqual(["✅", "👍", "👌", "➕"]);
  expect(next.counts["✅"]).toBe(1);
});

test("a new emoji replaces the least-used one once it is used more often", () => {
  // 🎉 is picked once: every seed is at 0, so the first seed (👍) gives way.
  const next = recordUse(initialQuickBar(), "🎉");
  expect(next.bar).toEqual(["🎉", "👌", "✅", "➕"]);
});

test("a new emoji used no more often than the least-used one does not get on the bar", () => {
  let state = initialQuickBar();
  // Use every seed twice, so each has a count of 2.
  state = pick(state, ["👍", "👍", "👌", "👌", "✅", "✅", "➕", "➕"]);
  // 🎉 reaches 1 and 2, but it only gets on the bar when it passes the least-used seed (2).
  state = pick(state, ["🎉", "🎉"]);
  expect(state.bar).toEqual(QUICK_SEED);
  state = recordUse(state, "🎉");
  expect(state.bar).toEqual(["🎉", "👌", "✅", "➕"]);
});

test("the bar never grows past its capacity", () => {
  const state = pick(initialQuickBar(), ["🎉", "🔥", "💯", "🙏", "👏", "😂"]);
  expect(state.bar.length).toBe(4);
});

test("a bad saved bar falls back to the seed, and bad counts are dropped", () => {
  expect(quickBarFromStorage("nonsense").bar).toEqual(QUICK_SEED);
  expect(quickBarFromStorage({ bar: [1, "", "🎉", "🎉"], counts: { "🎉": -1, "🔥": 3, "💯": "x" } })).toEqual({
    bar: ["🎉"],
    counts: { "🔥": 3 },
  });
});
