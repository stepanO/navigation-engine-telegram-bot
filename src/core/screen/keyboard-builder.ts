/**
 * KeyboardBuilder — fluent builder for KeyboardDefinition.
 *
 * Encodes ButtonDescriptors into InlineKeyboardButtons at build() time
 * using an injected CallbackDataEncoder.
 *
 * @example
 * const keyboard = new KeyboardBuilder()
 *   .row(Button.navigate('Events', '/events'), Button.navigate('Settings', '/settings'))
 *   .row(Button.back())
 *   .build();
 */

import type { KeyboardDefinition, InlineKeyboardButton, LoginUrl } from '../interfaces/screen.js';
import type { CallbackDataEncoder } from '../../callback/callback-encoder.js';
import { SimpleCallbackEncoder } from '../../callback/callback-encoder.js';
import type { ButtonDescriptor } from './button.js';
import { WIZ_PREV_TOKEN, WIZ_CANCEL_TOKEN, WIZ_CANCEL_PREFIX } from './button.js';

type KeyboardRowEntry =
  | { readonly kind: 'descriptors'; readonly buttons: readonly ButtonDescriptor[] }
  | { readonly kind: 'raw'; readonly buttons: readonly InlineKeyboardButton[] };

export class KeyboardBuilder {
  private readonly entries: KeyboardRowEntry[] = [];

  constructor(
    private readonly encoder: CallbackDataEncoder = new SimpleCallbackEncoder(),
  ) {}

  /**
   * Add a row of buttons. Each call to row() creates a new keyboard row.
   * Pass multiple buttons to place them side-by-side.
   *
   * @example
   * builder
   *   .row(Button.navigate('← Back', '/'))    // one button
   *   .row(Button.navigate('A', '/a'), Button.navigate('B', '/b'))  // two side-by-side
   */
  row(...buttons: ButtonDescriptor[]): this {
    if (buttons.length > 0) {
      this.entries.push({ kind: 'descriptors', buttons: [...buttons] });
    }
    return this;
  }

  /**
   * Add a row of pre-built InlineKeyboardButton objects, bypassing encoding.
   * Use for button types not covered by Button factory (e.g. web_app, login_url,
   * or any raw Telegram button structure).
   *
   * @example
   * builder.addRawRow({ text: 'Open App', web_app: { url: 'https://mini.app' } })
   */
  addRawRow(...buttons: InlineKeyboardButton[]): this {
    if (buttons.length > 0) {
      this.entries.push({ kind: 'raw', buttons: [...buttons] });
    }
    return this;
  }

  /**
   * Encode all accumulated rows and return a KeyboardDefinition.
   * Can be called multiple times — KeyboardBuilder is non-destructive.
   */
  build(): KeyboardDefinition {
    return {
      inline_keyboard: this.entries.map(entry =>
        entry.kind === 'raw'
          ? entry.buttons
          : entry.buttons.map(btn => this.encode(btn)),
      ),
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private encode(btn: ButtonDescriptor): InlineKeyboardButton {
    switch (btn.kind) {
      case 'navigate':
        return { text: btn.text, callback_data: this.encoder.encodeNavigation(btn.path) };
      case 'action':
        return { text: btn.text, callback_data: this.encoder.encodeAction(btn.name, btn.params) };
      case 'url':
        return { text: btn.text, url: btn.url };
      case 'back':
        return { text: btn.text, callback_data: this.encoder.encodeBack() };
      case 'web_app':
        return { text: btn.text, web_app: { url: btn.url } };
      case 'login': {
        const loginUrl: LoginUrl = { url: btn.url };
        const full: LoginUrl = btn.forwardText !== undefined ? { ...loginUrl, forwardText: btn.forwardText } : loginUrl;
        const withBot: LoginUrl = btn.botUsername !== undefined ? { ...full, botUsername: btn.botUsername } : full;
        const final: LoginUrl = btn.requestWriteAccess !== undefined ? { ...withBot, requestWriteAccess: btn.requestWriteAccess } : withBot;
        return { text: btn.text, login_url: final };
      }
      case 'raw':
        return { text: btn.text, callback_data: btn.callbackData };
      case 'prevStep':
        return { text: btn.text, callback_data: WIZ_PREV_TOKEN };
      case 'cancelWizard': {
        const cbData = btn.navigateTo !== undefined
          ? `${WIZ_CANCEL_PREFIX}${btn.navigateTo}`
          : WIZ_CANCEL_TOKEN;
        return { text: btn.text, callback_data: cbData };
      }
    }
  }
}
