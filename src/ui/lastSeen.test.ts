import { expect, test } from "nsh/test";
import { seenFromStorage, withSeen, type SeenStore } from "./lastSeen";

test("a place is recorded for its thread", () => {
  const next = withSeen({}, "100", { pid: "p5", seq: 5 }, 1000);
  expect(next).toEqual({ "100": { pid: "p5", seq: 5, at: 1000 } });
});

test("a place only moves forward: a floor not past the one kept is ignored", () => {
  const store: SeenStore = { "100": { pid: "p9", seq: 9, at: 1 } };
  expect(withSeen(store, "100", { pid: "p4", seq: 4 }, 2)).toBe(store);
  expect(withSeen(store, "100", { pid: "p9", seq: 9 }, 2)).toBe(store);
  expect(withSeen(store, "100", { pid: "p12", seq: 12 }, 2)["100"]).toEqual({ pid: "p12", seq: 12, at: 2 });
});

test("threads are kept apart", () => {
  const store = withSeen({}, "100", { pid: "p3", seq: 3 }, 1);
  const next = withSeen(store, "200", { pid: "q7", seq: 7 }, 2);
  expect(next["100"].seq).toBe(3);
  expect(next["200"].seq).toBe(7);
});

test("over the limit, the entries recorded longest ago are dropped", () => {
  let store: SeenStore = {};
  for (let i = 0; i < 200; i++) store = withSeen(store, `t${i}`, { pid: `p${i}`, seq: 1 }, i);
  const next = withSeen(store, "new", { pid: "pn", seq: 1 }, 500);
  expect(Object.keys(next).length).toBe(200);
  expect(next["t0"]).toBe(undefined);
  expect(next["t1"]).not.toBe(undefined);
  expect(next["new"].seq).toBe(1);
});

test("storage entries without the fields a place needs are dropped", () => {
  const parsed = seenFromStorage({
    good: { pid: "p1", seq: 1, at: 5 },
    noPid: { seq: 1, at: 5 },
    badSeq: { pid: "p2", seq: "2", at: 5 },
    nothing: null,
  });
  expect(Object.keys(parsed)).toEqual(["good"]);
  expect(seenFromStorage(["not", "an", "object"])).toEqual({});
  expect(seenFromStorage(null)).toEqual({});
});
