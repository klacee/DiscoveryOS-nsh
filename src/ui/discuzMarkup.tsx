import { Text } from "nsh";
import type { MarkdownExtension, TextViewCustomNode } from "nsh/base";
import { discuzFontStyle } from "../discuz/parse";

/** Discuz's `[color]` and `[size]` are `<font>` elements: each is read as a custom node of the TextView. */
export const DISCUZ_EXTENSIONS: MarkdownExtension[] = [{ name: "font", tag: "font" }];

/**
 * Shows a `<font>` in its color and size; other nodes show their text. A quote's attribution (marked
 * with its floor's id) opens that floor when pressed, with no link styling.
 */
export function renderDiscuzNode(node: TextViewCustomNode, onFloor?: (pid: string) => void) {
  const attributes = node.attributes ?? {};
  const floor = node.name === "font" ? attributes["data-floor"] : undefined;
  if (floor && onFloor) {
    return (
      <Text style={{ ...discuzFontStyle(attributes), textDecorationLine: "underline" }} onPress={() => onFloor(floor)}>
        {node.text ?? ""}
      </Text>
    );
  }
  return <Text style={node.name === "font" ? discuzFontStyle(attributes) : undefined}>{node.text ?? ""}</Text>;
}
