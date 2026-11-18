// The BBCode a post carries for its pictures and files, and the pure steps that keep the text and the
// list of pictures in line: a picture removed from the list also leaves the text, and a post's text
// gets the tag of each kept picture it does not already have. No UI or storage here, so tests can use it.
import type { Attached } from "./ReplyBox";

/** The BBCode a post carries for an uploaded attachment: `[attachimg]` for a picture, `[attach]` for a file. */
export const attachmentTag = (a: Pick<Attached, "id" | "kind">) => (a.kind === "image" ? `[attachimg]${a.id}[/attachimg]` : `[attach]${a.id}[/attach]`);

/** The image tag of one attachment id. */
export const imageTag = (id: string) => `[attachimg]${id}[/attachimg]`;

/**
 * The text of a post with the tags of the kept pictures: each tag the text does not already hold is
 * added on its own line after the text. A text that holds a tag (an edit's own pictures) is not given it twice.
 */
export function withPictureTags(text: string, pictures: Attached[]): string {
  const missing = pictures.map(attachmentTag).filter((tag) => !text.includes(tag));
  return [text, ...missing].join("\n");
}

/** The text without the image tag of attachment `id`: a line that held only the tag goes with it. */
export function withoutPictureTag(text: string, id: string): string {
  const tag = imageTag(id);
  return text
    .split("\n")
    .filter((line) => line.trim() !== tag)
    .map((line) => line.split(tag).join(""))
    .join("\n");
}

/** The bytes as a `data:` URL of `mime`, the form an image shows in. */
export function dataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(binary)}`;
}
