// The pictures and files of the reply, kept across threads and across runs of the app. A picture uploaded
// for a reply stays in this list until a reply is posted, whichever thread it is posted in. A picture taken
// out of the list is remembered too: the next reply posted sends its attachment as `attachdel[]`, so the forum
// deletes it. The list and the removals are cleared only by a reply that the forum confirmed.
//
// Storage keeps the records only. An image's bytes are a file in the app's data directory, not in the
// key-value storage (which is small): the file is read back as the picture's data URL at launch.
import { Storage, signal } from "nsh";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import process from "process";
import type { Attached } from "./ReplyBox";
import { dataUrl } from "./pictureTags";
import type { PixelSize } from "./pixelSize";

const KEY = "replyPictures";

/** A picture as storage keeps it: its record, and for an image the type of its file. */
type Saved = { id: string; kind: "image" | "file"; name: string; size: PixelSize | null; mime: string };

const pictures = signal<Attached[]>([]);
// Attachment ids taken out of the list, not yet sent to the forum.
const removed = signal<string[]>([]);
// Set once the list changes in this run, so a read from storage that finishes late does not overwrite it.
let changedThisRun = false;

// The folder the thumbnails are kept in; `null` when the host has no data directory (nothing is kept then).
const thumbnailDir = (): string | null => (process.dataDir ? `${process.dataDir}/reply-pictures` : null);

// An attachment id is the forum's number: anything else is not a file name this folder should hold.
const isId = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v);

const isSaved = (v: unknown): v is Saved => {
  if (!v || typeof v !== "object") return false;
  const s = v as Saved;
  return isId(s.id) && (s.kind === "image" || s.kind === "file") && typeof s.name === "string";
};

// The type of a picture, from its data URL (`data:image/png;base64,…`).
const mimeOf = (preview: string): string => /^data:([^;,]+)[;,]/.exec(preview)?.[1] ?? "image/jpeg";

async function keepThumbnail(id: string, bytes: Uint8Array): Promise<void> {
  const dir = thumbnailDir();
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${id}`, bytes);
}

function dropThumbnail(id: string): void {
  const dir = thumbnailDir();
  if (dir) unlink(`${dir}/${id}`).catch(() => undefined);
}

// The bytes of a picture's thumbnail, `null` when its file is gone.
async function readThumbnail(id: string): Promise<Uint8Array | null> {
  const dir = thumbnailDir();
  if (!dir) return null;
  try {
    return await readFile(`${dir}/${id}`);
  } catch {
    return null;
  }
}

function save() {
  const saved: Saved[] = pictures().map((p) => ({
    id: p.id,
    kind: p.kind,
    name: p.name,
    size: p.size,
    mime: p.kind === "image" ? mimeOf(p.preview) : "",
  }));
  // A list too large to store is a convenience lost for the next run, not a failed action.
  Storage.setItem(KEY, JSON.stringify({ pictures: saved, removed: removed() })).catch(() => undefined);
}

// Reads the saved list. An image whose file is gone is dropped: its picture cannot be shown or sent.
async function restore(saved: string): Promise<void> {
  const value = JSON.parse(saved) as { pictures?: unknown; removed?: unknown };
  const records = Array.isArray(value.pictures) ? value.pictures.filter(isSaved) : [];
  const loaded: Attached[] = [];
  for (const r of records) {
    const size = r.size && typeof r.size.width === "number" && typeof r.size.height === "number" ? r.size : null;
    if (r.kind === "file") {
      loaded.push({ id: r.id, kind: "file", name: r.name, preview: "", size });
      continue;
    }
    const bytes = await readThumbnail(r.id);
    if (bytes) loaded.push({ id: r.id, kind: "image", name: r.name, preview: dataUrl(bytes, r.mime || "image/jpeg"), size });
  }
  // A change made while the files were read is newer than what is saved.
  if (changedThisRun) return;
  const ids = Array.isArray(value.removed) ? value.removed.filter(isId) : [];
  pictures.set(loaded);
  removed.set(ids);
  if (loaded.length !== records.length) save();
}

Storage.getItem(KEY)
  .then((saved) => (saved && !changedThisRun ? restore(saved) : undefined))
  .catch(() => undefined);

/** The reply's pictures, callable like a signal; `set` saves the list. */
export const replyPictureList = Object.assign(() => pictures(), {
  set(next: Attached[]) {
    changedThisRun = true;
    pictures.set(next);
    save();
  },
});

/** Keeps an uploaded picture's bytes, so the list can show it after a restart. */
export const keepReplyPicture = (id: string, bytes: Uint8Array): Promise<void> => keepThumbnail(id, bytes).catch(() => undefined);

/** The attachment ids a reply must delete on the forum: taken out of the list since the last reply. */
export const replyRemovedIds = () => removed();

/** Takes a picture out of the reply's list. An image is remembered, so its attachment is deleted with the next reply. */
export function removeReplyPicture(picture: Attached): void {
  changedThisRun = true;
  pictures.set(pictures().filter((p) => p.id !== picture.id));
  if (picture.kind === "image") {
    dropThumbnail(picture.id);
    if (!removed().includes(picture.id)) removed.set([...removed(), picture.id]);
  }
  save();
}

/**
 * Clears what a confirmed reply sent: the pictures it named and the removals it carried. Anything added
 * or removed while the reply was being sent stays for the next one.
 */
export function clearSentReplyPictures(sentIds: string[], sentRemovals: string[]): void {
  changedThisRun = true;
  for (const id of sentIds) dropThumbnail(id);
  pictures.set(pictures().filter((p) => !sentIds.includes(p.id)));
  removed.set(removed().filter((id) => !sentRemovals.includes(id)));
  save();
}
