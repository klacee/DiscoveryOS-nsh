import { expect, test } from "nsh/test";
import { shortenLinks, shortLinkText } from "./shortLinks";

const long = "https://example.com/path/to/a/very/long/page/with/many/segments?id=42";

test("a short link keeps its whole address as the visible text", () => {
  expect(shortenLinks("看 https://a.b/c 吧")).toBe("看 [url=https://a.b/c]https://a.b/c[/url] 吧");
});

test("a long link shows its head, an ellipsis and its tail, and links the whole address", () => {
  const chars = Array.from(long);
  const text = `${chars.slice(0, 24).join("")}…${chars.slice(-12).join("")}`;
  expect(shortLinkText(long)).toBe(text);
  expect(shortenLinks(long)).toBe(`[url=${long}]${text}[/url]`);
});

test("punctuation right after a link stays outside the link", () => {
  expect(shortenLinks("https://a.b/c.")).toBe("[url=https://a.b/c]https://a.b/c[/url].");
  expect(shortenLinks("见https://a.b/c。")).toBe("见[url=https://a.b/c]https://a.b/c[/url]。");
});

test("links that are already BBCode are left as they are", () => {
  const url = "[url=https://x.com/abc]https://x.com/abc[/url]";
  expect(shortenLinks(url)).toBe(url);
  const img = "[img]https://x.com/a.png[/img]";
  expect(shortenLinks(img)).toBe(img);
  expect(shortenLinks("[url]https://x.com/abc[/url]")).toBe("[url]https://x.com/abc[/url]");
});

test("text without links is unchanged, and shortening twice changes nothing more", () => {
  expect(shortenLinks("没有链接的一句话")).toBe("没有链接的一句话");
  const once = shortenLinks(`${long} 和 https://a.b/c`);
  expect(shortenLinks(once)).toBe(once);
});
