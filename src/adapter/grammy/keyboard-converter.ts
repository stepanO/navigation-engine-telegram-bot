/**
 * Converts the engine's framework-agnostic KeyboardDefinition into the
 * raw inline keyboard markup object that the Telegram Bot API expects.
 *
 * We build the plain object directly rather than using grammY's InlineKeyboard
 * builder, because the engine already owns the structure and we want zero
 * extra allocations or mutation.
 */

import type { KeyboardDefinition } from '../../core/interfaces/screen.js';
import type { InlineKeyboardMarkup, InlineKeyboardButton } from 'grammy/types';

export function toInlineKeyboardMarkup(keyboard: KeyboardDefinition): InlineKeyboardMarkup {
  return {
    inline_keyboard: keyboard.inline_keyboard.map(row =>
      row.map(btn => {
        const button: InlineKeyboardButton = btn.url
          ? { text: btn.text, url: btn.url }
          : { text: btn.text, callback_data: btn.callback_data ?? '' };
        return button;
      }),
    ),
  };
}
