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

import type { KeyboardDefinition, InlineKeyboardButton } from '../interfaces/screen.js';
import type { CallbackDataEncoder } from '../../callback/callback-encoder.js';
import { SimpleCallbackEncoder } from '../../callback/callback-encoder.js';
import type { ButtonDescriptor } from './button.js';

export class KeyboardBuilder {
  private readonly rows: ButtonDescriptor[][] = [];

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
      this.rows.push([...buttons]);
    }
    return this;
  }

  /**
   * Encode all accumulated rows and return a KeyboardDefinition.
   * Can be called multiple times — KeyboardBuilder is non-destructive.
   */
  build(): KeyboardDefinition {
    return {
      inline_keyboard: this.rows.map(row => row.map(btn => this.encode(btn))),
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
    }
  }
}
