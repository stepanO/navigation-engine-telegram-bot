/**
 * NavigationContext — the central object passed to screens, guards, resolvers, and middleware.
 *
 * Deliberately framework-agnostic: no grammY types here.
 * The grammY adapter (Phase 2) populates user/chat from the raw Context.
 */

import type { RouteMatch, RouteParams, QueryParams } from './route.js';

/** Minimal Telegram user info exposed to screens. */
export interface TelegramUser {
  readonly id: number;
  readonly username?: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly languageCode?: string;
  readonly isBot: boolean;
}

/** Minimal Telegram chat info exposed to screens. */
export interface TelegramChat {
  readonly id: number;
  readonly type: 'private' | 'group' | 'supergroup' | 'channel';
  readonly title?: string;
}

/**
 * A single entry in the navigation history stack.
 */
export interface HistoryEntry {
  readonly path: string;
  readonly params: RouteParams;
  readonly query: QueryParams;
  readonly timestamp: number;
}

/**
 * The primary context object threaded through every phase of navigation.
 *
 * TData is the shape of resolved data. Defaults to a loose map; screens can
 * narrow it with their own generic parameter for type-safe resolver access.
 *
 * @example
 * class EventScreen implements ScreenComponent {
 *   async render(ctx: NavigationContext<{ event: Event }>): Promise<ScreenView> {
 *     const event = ctx.data.event; // typed as Event
 *   }
 * }
 */
export interface NavigationContext<
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Named params extracted from the path pattern, e.g. { eventId: "42" }. */
  readonly params: RouteParams;

  /** Query string params, e.g. { page: "2", sort: "name" }. */
  readonly query: QueryParams;

  /**
   * Data populated by resolvers and merged with route static data.
   * Resolvers run in parallel; all results are available here before render().
   */
  readonly data: TData;

  /** The matched route for the current navigation. */
  readonly route: RouteMatch;

  /** Telegram user who triggered this navigation event. */
  readonly user: TelegramUser;

  /** Telegram chat where the bot is operating. */
  readonly chat: TelegramChat;

  /**
   * Navigate to a new path, pushing it onto the history stack.
   * Triggers the full navigation lifecycle (guards → resolvers → render).
   */
  navigate(path: string): Promise<void>;

  /**
   * Replace the current history entry with a new path.
   * History length does not grow; back() returns to the entry before the replaced one.
   */
  replace(path: string): Promise<void>;

  /** Navigate to the previous history entry, if one exists. */
  back(): Promise<void>;

  /**
   * Cancel the active wizard session for the current user.
   *
   * If `wizardId` is provided, cancels that specific wizard.
   * If omitted, cancels whichever wizard is currently active.
   * No-op when no wizard engine is configured or no wizard is active.
   *
   * Typical use: call from `beforeEnter()` on hub screens to clean up
   * any stale wizard state when the user navigates away mid-wizard.
   */
  cancelActiveWizard(wizardId?: string): Promise<void>;
}

/**
 * Per-user navigation state persisted in the StateStore.
 */
export interface NavigationState {
  readonly chatId: number;
  readonly userId: number;
  /** Current position in the history stack (index into entries[]). */
  readonly cursor: number;
  readonly entries: readonly HistoryEntry[];
  /**
   * The Telegram message ID of the bot's active navigation message.
   * Persisted so the renderer can edit the same message across restarts.
   */
  readonly messageId?: number;
}
