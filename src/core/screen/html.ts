/**
 * HTML formatting utilities for Telegram HTML parse mode.
 *
 * Telegram's HTML parse mode supports a subset of HTML tags:
 *   <b>, <strong>  — bold
 *   <i>, <em>      — italic
 *   <u>, <ins>     — underline
 *   <s>, <strike>, <del> — strikethrough
 *   <code>         — monospace inline
 *   <pre>          — monospace block
 *   <pre><code class="language-x"> — syntax-highlighted block
 *   <a href="URL"> — hyperlink
 *   <tg-spoiler>   — spoiler (hidden until tapped)
 *
 * All tag functions that accept user-controlled content auto-escape it.
 * Functions marked "raw" accept pre-formatted HTML.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

/** Escapes &, <, > for safe inclusion in Telegram HTML messages. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, c => HTML_ESCAPE_MAP[c] ?? c);
}

/** <b>bold text</b> — content is auto-escaped. */
export function bold(text: string): string {
  return `<b>${escapeHtml(text)}</b>`;
}

/** <i>italic text</i> — content is auto-escaped. */
export function italic(text: string): string {
  return `<i>${escapeHtml(text)}</i>`;
}

/** <u>underlined text</u> — content is auto-escaped. */
export function underline(text: string): string {
  return `<u>${escapeHtml(text)}</u>`;
}

/** <s>strikethrough text</s> — content is auto-escaped. */
export function strikethrough(text: string): string {
  return `<s>${escapeHtml(text)}</s>`;
}

/** <code>monospace</code> — content is auto-escaped. */
export function code(text: string): string {
  return `<code>${escapeHtml(text)}</code>`;
}

/**
 * <pre>monospace block</pre> — content is auto-escaped.
 * @param language  Optional syntax language class, e.g. "typescript".
 */
export function pre(text: string, language?: string): string {
  const inner = escapeHtml(text);
  return language
    ? `<pre><code class="language-${language}">${inner}</code></pre>`
    : `<pre>${inner}</pre>`;
}

/** <a href="URL">link text</a> — text is auto-escaped, URL is used as-is. */
export function link(text: string, url: string): string {
  return `<a href="${url}">${escapeHtml(text)}</a>`;
}

/** <tg-spoiler>hidden until tapped</tg-spoiler> — content passed through as raw HTML. */
export function spoiler(rawHtml: string): string {
  return `<tg-spoiler>${rawHtml}</tg-spoiler>`;
}
