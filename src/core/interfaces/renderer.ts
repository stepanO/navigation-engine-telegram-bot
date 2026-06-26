/**
 * Renderer interface — converts a ScreenView into Telegram operations.
 *
 * The engine never calls the Telegram API directly.
 * The grammY renderer (Phase 2) implements this interface.
 *
 * Design decision: RenderTarget carries only the minimal addressing info
 * (chatId, messageId, callbackQueryId). The renderer holds the bot reference.
 * This keeps the engine fully framework-agnostic.
 */

import type { ScreenView } from './screen.js';

/**
 * Addressing info for a single Telegram message update.
 *
 * messageId        — present when there is an existing message to edit.
 *                    Undefined when the renderer should send a new message.
 * callbackQueryId  — present when the navigation was triggered by a button press.
 *                    The renderer uses this for answerCallbackQuery.
 */
export interface RenderTarget {
  readonly chatId: number;
  readonly userId: number;
  readonly messageId?: number;
  readonly callbackQueryId?: string;
}

/**
 * Returned by Renderer.render().
 * When the renderer sent a NEW message (no messageId in target),
 * it reports back the new message ID so the engine can persist it.
 */
export interface RenderResult {
  /** Set when a new message was sent. Undefined when an existing message was edited. */
  readonly messageId?: number;
}

/**
 * Renderer converts ScreenView + RenderTarget into Telegram operations.
 *
 * Possible operations (renderer decides which to use):
 *   - editMessageText        (most common, same message)
 *   - sendMessage            (no existing message to edit, or edit failed)
 *   - answerCallbackQuery    (always called to dismiss the spinner)
 */
export interface Renderer {
  render(view: ScreenView, target: RenderTarget): Promise<RenderResult>;
  answerCallbackQuery(target: RenderTarget, text?: string, showAlert?: boolean): Promise<void>;
  deleteMessage(chatId: number, messageId: number): Promise<void>;
}
