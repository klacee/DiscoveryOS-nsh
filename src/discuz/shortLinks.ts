// Turns the bare links in a reply or a new thread into BBCode links whose visible text is shortened:
// `https://…` becomes `[url=https://…]https://…/…tail[/url]`, the middle cut out. The link itself keeps the
// whole address; only the text the reader sees is short. Links the text already marks up (`[url]`, `[img]`,
// `[attach…]`, `[code]`) are left alone, and so is a link that is already a BBCode link.

/** A link longer than this many characters shows only its head and its tail. */
export const LINK_TEXT_MAX = 40;
/** The characters a shortened link keeps at its start and at its end. */
export const LINK_TEXT_HEAD = 24;
export const LINK_TEXT_TAIL = 12;

// Group 1: markup that is already BBCode for a link, a picture, an attachment or code, kept as it is.
// Group 2: a bare http(s) link. It stops at spaces, brackets, quotes, and CJK or fullwidth punctuation.
const LINK_OR_MARKUP = /(\[(url|img|attachimg|attach|code)(?:=[^\]]*)?\][\s\S]*?\[\/\2\])|(https?:\/\/[^\s[\]<>"'\u3000-\u303f\uff00-\uffef]+)/gi;

// Punctuation that ends a sentence rather than the link, when it comes right after the link.
export const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

/** The visible text of a link: the whole address when it is short, else its head, an ellipsis, and its tail. */
export function shortLinkText(url: string): string {
  const chars = Array.from(url);
  if (chars.length <= LINK_TEXT_MAX) return url;
  return `${chars.slice(0, LINK_TEXT_HEAD).join("")}…${chars.slice(-LINK_TEXT_TAIL).join("")}`;
}

/** Wraps each bare link in `content` as a BBCode link with shortened text. Text that is not a link is unchanged. */
export function shortenLinks(content: string): string {
  return content.replace(LINK_OR_MARKUP, (match, markup: string | undefined, _tag: string | undefined, bare: string | undefined) => {
    if (markup !== undefined || bare === undefined) return match;
    const trailing = TRAILING_PUNCTUATION.exec(bare)?.[0] ?? "";
    const url = trailing ? bare.slice(0, -trailing.length) : bare;
    if (url.length === "https://".length) return match;
    return `[url=${url}]${shortLinkText(url)}[/url]${trailing}`;
  });
}
