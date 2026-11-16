import { Text } from "nsh";
import type { MarkdownExtension, TextViewCustomNode } from "nsh/base";
import { discuzFontStyle } from "../discuz/parse";
import { timeAgo } from "../discuz/timeAgo";

/** Discuz's `[color]` and `[size]` are `<font>` elements: each is read as a custom node of the TextView. */
export const DISCUZ_EXTENSIONS: MarkdownExtension[] = [{ name: "font", tag: "font" }];

// A quote's attribution as the forum writes it: "author 发表于 time".
const ATTRIBUTION = /^\s*(.+?) 发表于 (.+?)\s*$/;

/**
 * The label of a quote's attribution: "author · #floor · time ago". The floor is left out when it is
 * not known (`seq` undefined); text that is not an attribution is shown as it is.
 */
export function attributionLabel(text: string, seq: number | undefined): string {
  const match = ATTRIBUTION.exec(text);
  if (!match) return text;
  return [match[1], seq !== undefined ? `#${seq}` : undefined, timeAgo(match[2])].filter(Boolean).join(" · ");
}

/**
 * Shows a `<font>` in its color and size; other nodes show their text. A quote's attribution (marked
 * with its floor's id) opens that floor when pressed, with no link styling, and reads as its label:
 * the author, the floor's number (when it is loaded, through `floorSeq`) and how long ago it was posted.
 */
export function renderDiscuzNode(
  node: TextViewCustomNode,
  onFloor?: (pid: string) => void,
  floorSeq?: (pid: string) => number | undefined,
) {
  const attributes = node.attributes ?? {};
  const floor = node.name === "font" ? attributes["data-floor"] : undefined;
  if (floor && onFloor) {
    return (
      <Text style={{ ...discuzFontStyle(attributes), textDecorationLine: "underline" }} onPress={() => onFloor(floor)}>
        {attributionLabel(node.text ?? "", floorSeq?.(floor))}
      </Text>
    );
  }
  return <Text style={node.name === "font" ? discuzFontStyle(attributes) : undefined}>{node.text ?? ""}</Text>;
}
