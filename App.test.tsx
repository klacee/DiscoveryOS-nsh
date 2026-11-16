// `nsh test` runs this in a headless runner: its network answers nothing, so a
// sign-in there must fail with a message rather than sign in.
import { expect, open, test } from "nsh/test";

test("the forum shows without signing in, with no Favorites", async () => {
  // A desktop window: the channel column is the full column, with its heading.
  const app = await open("./App.tsx", { width: 1200 });
  expect(app.texts()).toContain("版块");
  expect(app.texts()).toContain("帖子");
  expect(app.texts()).not.toContain("收藏");
});

test("a narrow window folds the channel column into a rail, without its heading", async () => {
  // The default test viewport is a phone's: the channel column is the rail.
  const app = await open("./App.tsx");
  expect(app.texts()).not.toContain("版块");
  expect(app.texts()).toContain("帖子");
});

test("signed out with nothing saved, the sign-in dialog opens and no channel error is shown", async () => {
  const app = await open("./App.tsx", { width: 1200 });
  expect(app.texts()).toContain("账号");
  expect(app.texts()).not.toContain("无法加载版块，点击重试。");
});

test("the blank avatar opens the sign-in dialog, and Cancel closes it", async () => {
  // Signed out with nothing saved, the dialog opens on launch and covers the header's Sign in: close it first.
  const app = await open("./App.tsx");
  expect(app.texts()).toContain("账号");
  await app.press("text:取消");
  expect(app.texts()).not.toContain("账号");
  await app.press("label:登录");
  expect(app.texts()).toContain("账号");
  await app.press("text:取消");
  expect(app.texts()).not.toContain("账号");
});

test("a failed sign-in shows an error", async () => {
  // The dialog is already open on launch (see above), so it is filled in directly.
  const app = await open("./App.tsx");
  await app.type("用户名", "someone");
  await app.type("密码", "secret");
  await app.press("text:登录");
  expect(app.texts().some((t) => t.startsWith("登录失败"))).toBe(true);
});
