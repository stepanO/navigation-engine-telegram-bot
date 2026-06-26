/**
 * ScreenBuilder — fluent builder for ScreenView.
 *
 * Accumulates text sections and assembles them with blank-line separators.
 * Defaults to Telegram HTML parse mode; every method that wraps content in
 * HTML tags auto-escapes unsafe characters. Methods that accept raw HTML
 * (section, html) pass content through unchanged.
 *
 * @example
 * return ScreenBuilder.create()
 *   .title(event.name)
 *   .badge('Status', event.status)
 *   .divider()
 *   .section(participantsList)
 *   .keyboard(
 *     new KeyboardBuilder()
 *       .row(Button.back())
 *       .build()
 *   )
 *   .build();
 */

import type { ScreenView, KeyboardDefinition, ParseMode } from '../interfaces/screen.js';
import { escapeHtml, bold, italic, code, pre, link } from './html.js';

const DIVIDER = '─────────────────────';

export class ScreenBuilder {
  private readonly parts: string[] = [];
  private keyboardDef: KeyboardDefinition | undefined = undefined;
  private parseModeVal: ParseMode = 'HTML';

  // ─── Factory ──────────────────────────────────────────────────────────────

  static create(): ScreenBuilder {
    return new ScreenBuilder();
  }

  // ─── Structure ────────────────────────────────────────────────────────────

  /**
   * Large heading. Content is HTML-escaped then wrapped in <b>.
   * @example .title('My Event')
   */
  title(text: string): this {
    this.parts.push(bold(text));
    return this;
  }

  /**
   * Secondary heading. Content is HTML-escaped then wrapped in <i>.
   * @example .subtitle('March 2025')
   */
  subtitle(text: string): this {
    this.parts.push(italic(text));
    return this;
  }

  /**
   * Plain text section. Passed through unchanged — the caller is responsible
   * for HTML-escaping any user-provided strings inside it.
   * @example .section('No participants yet.')
   * @example .section(`Participants: ${escapeHtml(list)}`)
   */
  section(text: string): this {
    this.parts.push(text);
    return this;
  }

  /**
   * Alias for section(). Useful for inline descriptions.
   */
  text(text: string): this {
    return this.section(text);
  }

  /**
   * Raw HTML fragment inserted as-is. Use when you need custom Telegram HTML
   * that ScreenBuilder does not have a dedicated helper for.
   */
  html(rawHtml: string): this {
    this.parts.push(rawHtml);
    return this;
  }

  /**
   * Horizontal visual divider: ─────────────────────
   */
  divider(): this {
    this.parts.push(DIVIDER);
    return this;
  }

  /**
   * Adds an empty line (blank section) to increase vertical spacing.
   */
  spacer(): this {
    this.parts.push('');
    return this;
  }

  // ─── Rich text ────────────────────────────────────────────────────────────

  /**
   * Inline bold text. Content is HTML-escaped.
   * Adds a standalone bold section; for inline use, call html() directly.
   */
  bold(text: string): this {
    this.parts.push(bold(text));
    return this;
  }

  /**
   * Inline italic text. Content is HTML-escaped.
   */
  italic(text: string): this {
    this.parts.push(italic(text));
    return this;
  }

  /**
   * Inline monospace code. Content is HTML-escaped.
   * @example .code('npm install')
   */
  code(text: string): this {
    this.parts.push(code(text));
    return this;
  }

  /**
   * Monospace code block. Content is HTML-escaped.
   * @param language  Optional syntax-highlight language class.
   */
  pre(text: string, language?: string): this {
    this.parts.push(pre(text, language));
    return this;
  }

  /**
   * Hyperlink. Text is HTML-escaped; URL is used as-is.
   * @example .link('Open event', 'https://app.example.com/events/42')
   */
  link(text: string, url: string): this {
    this.parts.push(link(text, url));
    return this;
  }

  // ─── Data display ─────────────────────────────────────────────────────────

  /**
   * Labelled value: <b>Label:</b> value
   * Both label and value are HTML-escaped.
   * @example .badge('Status', 'Active')   → Status: Active (label bold)
   */
  badge(label: string, value: string | number): this {
    this.parts.push(`<b>${escapeHtml(label)}:</b> ${escapeHtml(String(value))}`);
    return this;
  }

  /**
   * Bullet list. Each item is HTML-escaped.
   * @example .list(['Alice', 'Bob', 'Carol'])
   */
  list(items: readonly string[]): this {
    if (items.length > 0) {
      this.parts.push(items.map(item => `• ${escapeHtml(item)}`).join('\n'));
    }
    return this;
  }

  // ─── Output configuration ─────────────────────────────────────────────────

  /**
   * Attach an inline keyboard to the message.
   * Built with KeyboardBuilder.build() and passed in.
   */
  keyboard(def: KeyboardDefinition): this {
    this.keyboardDef = def;
    return this;
  }

  /**
   * Override the default parse mode (HTML).
   * Only change this if you are constructing text outside of ScreenBuilder's
   * helpers and need MarkdownV2 or plain text.
   */
  parseMode(mode: ParseMode): this {
    this.parseModeVal = mode;
    return this;
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  /**
   * Assemble all accumulated parts into a ScreenView.
   * Parts are joined with a blank line (\n\n) between them.
   *
   * @throws {Error} if no content has been added.
   */
  build(): ScreenView {
    const text = this.parts.join('\n\n');
    if (!text.trim()) {
      throw new Error('ScreenBuilder.build() called with no content');
    }

    return {
      text,
      parseMode: this.parseModeVal,
      ...(this.keyboardDef !== undefined ? { keyboard: this.keyboardDef } : {}),
    };
  }
}
