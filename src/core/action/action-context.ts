/**
 * ActionContext — the object passed to every ActionHandler.
 *
 * Actions are side-effects triggered by button presses that do NOT navigate
 * by default. The handler receives the action name + params, user/chat info,
 * and navigation helpers so it can redirect after completing (e.g. refresh
 * or go to a confirmation screen after a destructive operation).
 *
 * @example
 * class DeleteEventHandler extends BaseActionHandler {
 *   async handle(ctx: ActionContext): Promise<void> {
 *     const eventId = ctx.params[0];
 *     await db.events.delete(eventId);
 *     await ctx.navigate('/events');   // refresh the list after delete
 *   }
 * }
 */

import type { TelegramUser, TelegramChat } from '../interfaces/navigation.js';

export interface ActionContext {
  /** The action name as registered in ActionDispatcher (e.g., 'deleteEvent'). */
  readonly name: string;

  /** Positional params extracted from callback_data (e.g., ['42'] from 'action:deleteEvent:42'). */
  readonly params: readonly string[];

  /** Telegram user who pressed the button. */
  readonly user: TelegramUser;

  /** Telegram chat where the button was pressed. */
  readonly chat: TelegramChat;

  /** Navigate to a route after the action completes. Pushes a new history entry. */
  navigate(path: string): Promise<void>;

  /** Replace the current history entry with a new route. */
  replace(path: string): Promise<void>;

  /** Navigate to the previous history entry. */
  back(): Promise<void>;
}

export interface ActionHandler {
  handle(ctx: ActionContext): Promise<void>;
}

/** Constructor type for action handler classes (no-arg, consistent with guards/resolvers). */
export type ActionHandlerConstructor = new () => ActionHandler;
