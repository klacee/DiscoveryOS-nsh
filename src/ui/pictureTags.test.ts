import { expect, test } from "nsh/test";
import { attachmentTag, dataUrl, withPictureTags, withoutPictureTag } from "./pictureTags";
import type { Attached } from "./ReplyBox";

const picture = (id: string): Attached => ({ id, kind: "image", name: `${id}.png`, preview: "", size: null });
const file = (id: string): Attached => ({ id, kind: "file", name: `${id}.zip`, preview: "", size: null });

test("a picture is tagged as an image, a file as an attachment", () => {
  expect(attachmentTag(picture("6176202"))).toBe("[attachimg]6176202[/attachimg]");
  expect(attachmentTag(file("6175991"))).toBe("[attach]6175991[/attach]");
});

test("the kept pictures are added to the text, one tag each on its own line", () => {
  expect(withPictureTags("hello", [picture("1"), file("2")])).toBe("hello\n[attachimg]1[/attachimg]\n[attach]2[/attach]");
  expect(withPictureTags("hello", [])).toBe("hello");
});

test("a picture whose tag the text already holds is not tagged twice", () => {
  expect(withPictureTags("hi\n[attachimg]1[/attachimg]", [picture("1"), picture("2")])).toBe("hi\n[attachimg]1[/attachimg]\n[attachimg]2[/attachimg]");
});

test("removing a picture takes its tag out of the text, and the line it alone filled", () => {
  expect(withoutPictureTag("hi\n[attachimg]1[/attachimg]\n[attachimg]2[/attachimg]", "1")).toBe("hi\n[attachimg]2[/attachimg]");
  expect(withoutPictureTag("see [attachimg]1[/attachimg] here", "1")).toBe("see  here");
  expect(withoutPictureTag("no tag", "1")).toBe("no tag");
});

test("bytes become a data URL of their type", () => {
  expect(dataUrl(new Uint8Array([104, 105]), "image/png")).toBe("data:image/png;base64,aGk=");
});
