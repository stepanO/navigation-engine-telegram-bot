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
        if (btn.web_app) {
          return { text: btn.text, web_app: btn.web_app } as InlineKeyboardButton;
        }
        if (btn.login_url) {
          return { text: btn.text, login_url: btn.login_url } as InlineKeyboardButton;
        }
        if (btn.url) {
          return { text: btn.text, url: btn.url } as InlineKeyboardButton;
        }
        return { text: btn.text, callback_data: btn.callback_data ?? '' } as InlineKeyboardButton;
      }),
    ),
  };
}
