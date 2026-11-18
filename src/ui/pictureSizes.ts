import { Image, pixelRatio, signal, untracked } from "nsh";
import { pictureUrls, type PictureOptions, type PictureSize } from "../discuz/parse";
import { consoleDebug } from "../debugLog";

// Each picture's size in pixels, by its absolute URL. A picture's size is read once, when a post that
// shows it is first drawn; the posts that show it draw again when it is known.
const sizes = signal<Record<string, PictureSize>>({});
const requested = new Set<string>();

/** The sizes read so far, by URL. Reading it in an effect runs the effect each time a picture's size arrives: a
 * picture drawn at its size changes the height of the post that shows it. */
export const knownPictureSizes = sizes;

/** The options that show a post's pictures at their own size on this screen: asks for the sizes not read yet. */
export function pictureOptions(body: string, base: string): PictureOptions {
  for (const url of pictureUrls(body, base)) request(url);
  return { base, sizeOf: (url) => sizes()[url], pixelRatio: pixelRatio() };
}

function request(url: string): void {
  if (requested.has(url)) return;
  requested.add(url);
  Image.getSize(url).then(
    (size) => sizes.set({ ...untracked(sizes), [url]: size }),
    // Without a size the picture shows at its natural size, as before.
    (error) => consoleDebug("picture size", url, error),
  );
}
