/**
 * GrammYRenderer — implements Renderer using the grammY Bot API.
 *
 * Accepts the grammY `Api` object rather than the full `Bot` so it can be
 * injected and tested with a mock Api without starting a real bot.
 *
 * Edit vs Send decision:
 *   If target.messageId is present → editMessageText.
 *   If absent → sendMessage and return the new message_id in RenderResult.
 *
 * Error handling on edit:
 *   "message is not modified"  → silently ignore (content is already correct).
 *   "message to edit not found" → fall back to sendMessage.
 *   "MESSAGE_ID_INVALID"        → fall back to sendMessage.
 *   All other errors            → rethrow.
 */

import { GrammyError } from 'grammy';
import type { Api } from 'grammy';
import type { Renderer, RenderTarget, RenderResult } from '../../core/interfaces/renderer.js';
import type { ScreenView } from '../../core/interfaces/screen.js';
import { toInlineKeyboardMarkup } from './keyboard-converter.js';

export class GrammYRenderer implements Renderer {
  /** Keyed by messageId; stores a fingerprint of the last successfully rendered view. */
  private readonly viewCache = new Map<number, string>();

  constructor(private readonly api: Api) {}

  async render(view: ScreenView, target: RenderTarget): Promise<RenderResult> {
    if (target.messageId !== undefined) {
      return this.editOrFallback(view, target, target.messageId);
    }
    return this.sendNew(view, target);
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.api.deleteMessage(chatId, messageId);
    } catch (err) {
      if (
        err instanceof GrammyError &&
        (err.description.includes('message to delete not found') ||
         err.description.includes('MESSAGE_ID_INVALID'))
      ) {
        return;
      }
      throw err;
    }
  }

  async answerCallbackQuery(target: RenderTarget, text?: string, showAlert?: boolean): Promise<void> {
    if (!target.callbackQueryId) return;

    await this.api.answerCallbackQuery(
      target.callbackQueryId,
      text !== undefined ? { text, show_alert: showAlert ?? false } : undefined,
    );
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async editOrFallback(
    view: ScreenView,
    target: RenderTarget,
    messageId: number,
  ): Promise<RenderResult> {
    const fingerprint = this.fingerprint(view);
    if (this.viewCache.get(messageId) === fingerprint) {
      return {};
    }

    try {
      await this.api.editMessageText(
        target.chatId,
        messageId,
        view.text,
        this.editOptions(view),
      );
      this.viewCache.set(messageId, fingerprint);
      return {};
    } catch (err) {
      if (err instanceof GrammyError) {
        if (err.description.includes('message is not modified')) {
          this.viewCache.set(messageId, fingerprint);
          return {};
        }
        if (
          err.description.includes('message to edit not found') ||
          err.description.includes('MESSAGE_ID_INVALID') ||
          err.description.includes('message can\'t be edited')
        ) {
          // The navigation message was deleted — send a fresh one.
          return this.sendNew(view, target);
        }
      }
      throw err;
    }
  }

  private async sendNew(view: ScreenView, target: RenderTarget): Promise<RenderResult> {
    const msg = await this.api.sendMessage(
      target.chatId,
      view.text,
      this.sendOptions(view),
    );
    this.viewCache.set(msg.message_id, this.fingerprint(view));
    return { messageId: msg.message_id };
  }

  private fingerprint(view: ScreenView): string {
    const kb = view.keyboard !== undefined ? JSON.stringify(view.keyboard) : '';
    return `${view.text}\x00${view.parseMode ?? ''}\x00${kb}`;
  }

  private editOptions(view: ScreenView) {
    return {
      ...(view.parseMode ? { parse_mode: view.parseMode } : {}),
      ...(view.keyboard ? { reply_markup: toInlineKeyboardMarkup(view.keyboard) } : {}),
    };
  }

  private sendOptions(view: ScreenView) {
    return {
      ...(view.parseMode ? { parse_mode: view.parseMode } : {}),
      ...(view.keyboard ? { reply_markup: toInlineKeyboardMarkup(view.keyboard) } : {}),
    };
  }
}
