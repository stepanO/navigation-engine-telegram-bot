/**
 * GrammYAdapter — bridges grammY middleware into NavigationEngine calls.
 *
 * Responsibilities:
 *   1. Intercept callback_query updates with nav:/action: prefixes.
 *   2. Extract TelegramUser + TelegramChat from the grammY Context.
 *   3. Build a RenderTarget (chatId, userId, messageId, callbackQueryId).
 *      messageId comes from persisted state (previous render) or from the
 *      message that carries the button (ctx.callbackQuery.message.message_id).
 *   4. Dispatch to NavigationEngine.navigate / back / ActionDispatcher (Phase 5).
 *
 * navigateFromContext() is the entry point for command handlers:
 *   bot.command('start', ctx => adapter.navigateFromContext(ctx, '/'));
 */

import type { Context, MiddlewareFn } from 'grammy';
import type { NavigationEngine } from '../../core/engine/navigation-engine.js';
import type { StateStore } from '../../core/interfaces/state.js';
import type { RenderTarget } from '../../core/interfaces/renderer.js';
import type { CallbackDataEncoder } from '../../callback/callback-encoder.js';
import type { ActionDispatcher } from '../../core/action/action-dispatcher.js';
import type { ActionContext } from '../../core/action/action-context.js';
import { buildStateKey } from '../../core/interfaces/state.js';
import { extractTelegramUser, extractTelegramChat } from './context-extractors.js';

export class GrammYAdapter {
  constructor(
    private readonly engine: NavigationEngine,
    private readonly stateStore: StateStore,
    private readonly encoder: CallbackDataEncoder,
    private readonly dispatcher?: ActionDispatcher,
  ) {}

  /**
   * Returns a grammY MiddlewareFn that handles navigation and action callback queries.
   * Register with bot.use(adapter.middleware()).
   */
  middleware(): MiddlewareFn<Context> {
    return async (ctx, next) => {
      const data = ctx.callbackQuery?.data;
      if (!data) {
        await next();
        return;
      }

      const decoded = this.encoder.decode(data);
      if (decoded.type === 'unknown') {
        await next();
        return;
      }

      if (!ctx.from || !ctx.chat) {
        await next();
        return;
      }

      const user = extractTelegramUser(ctx.from);
      const chat = extractTelegramChat(ctx.chat);
      const target = await this.buildTarget(ctx);

      if (decoded.type === 'action') {
        if (this.dispatcher) {
          const actionCtx: ActionContext = {
            name: decoded.name,
            params: decoded.params,
            user,
            chat,
            navigate: (path) => this.engine.navigate(path, user, chat, target),
            replace: (path) => this.engine.replace(path, user, chat, target),
            back: () => this.engine.back(user, chat, target),
          };
          await this.dispatcher.dispatch(actionCtx);
        } else {
          // No dispatcher configured — forward to next grammY middleware.
          await next();
        }
        return;
      }

      if (decoded.type === 'back') {
        await this.engine.back(user, chat, target);
      } else {
        await this.engine.navigate(decoded.path, user, chat, target);
      }
    };
  }

  /**
   * Trigger navigation from a command handler or any non-callback context.
   *
   * @example
   * bot.command('start', ctx => adapter.navigateFromContext(ctx, '/'));
   */
  async navigateFromContext(ctx: Context, path: string): Promise<void> {
    if (!ctx.from || !ctx.chat) {
      throw new Error('navigateFromContext requires ctx.from and ctx.chat');
    }

    const user = extractTelegramUser(ctx.from);
    const chat = extractTelegramChat(ctx.chat);
    const target = await this.buildTarget(ctx);
    await this.engine.navigate(path, user, chat, target);
  }

  /**
   * Explicitly replace the current history entry from an external context.
   * Useful for mid-flow redirects triggered by non-button events (e.g., webhooks).
   */
  async replaceFromContext(ctx: Context, path: string): Promise<void> {
    if (!ctx.from || !ctx.chat) {
      throw new Error('replaceFromContext requires ctx.from and ctx.chat');
    }

    const user = extractTelegramUser(ctx.from);
    const chat = extractTelegramChat(ctx.chat);
    const target = await this.buildTarget(ctx);
    await this.engine.replace(path, user, chat, target);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Builds a RenderTarget from a grammY Context.
   *
   * messageId resolution order:
   *   1. Persisted state (most reliable — survives bot restarts).
   *   2. ctx.callbackQuery.message.message_id (present for button presses).
   *   3. undefined (renderer will send a new message).
   */
  private async buildTarget(ctx: Context): Promise<RenderTarget> {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;

    if (chatId === undefined || userId === undefined) {
      throw new Error('Cannot build RenderTarget: missing chatId or userId');
    }

    const stateKey = buildStateKey(chatId, userId);
    const state = await this.stateStore.get(stateKey);

    const messageId =
      state?.messageId ??
      ctx.callbackQuery?.message?.message_id;

    const callbackQueryId = ctx.callbackQuery?.id;
    const base: RenderTarget = { chatId, userId };
    const withCbq: RenderTarget = callbackQueryId !== undefined
      ? { ...base, callbackQueryId }
      : base;

    return messageId !== undefined
      ? { ...withCbq, messageId }
      : withCbq;
  }
}
