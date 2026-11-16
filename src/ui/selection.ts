// The text selected anywhere in the main interface. The whole interface is one `selectable` view, which
// holds the one selection, so a reply's own text view reports nothing (its `selectedText()` is empty);
// the outer view reports it here, and `q` reads it.
import { signal } from "nsh";

/** The selected text, as a copy gives it; empty once nothing is selected. */
export const selectedText = signal("");
