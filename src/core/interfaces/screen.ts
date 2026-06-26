/**
 * Screen component interfaces and view types.
 *
 * A Screen is a pure rendering unit — it knows how to produce a ScreenView
 * given a NavigationContext, but never calls the Telegram API directly.
 * All Telegram operations go through the Renderer.
 */

import type { NavigationContext } from './navigation.js';
import type { Injector } from '../di/injector.js';

export type ParseMode = 'HTML' | 'Markdown' | 'MarkdownV2';

/** A single inline keyboard button. */
export interface InlineKeyboardButton {
  readonly text: string;
  /** Pre-encoded callback data. Use KeyboardBuilder / Button helpers to construct. */
  readonly callback_data?: string;
  readonly url?: string;
}

/**
 * Framework-agnostic keyboard definition.
 * The Renderer converts this into a grammY InlineKeyboard.
 */
export interface KeyboardDefinition {
  /** Rows of buttons. Each row is an array of buttons rendered on the same line. */
  readonly inline_keyboard: readonly (readonly InlineKeyboardButton[])[];
}

/**
 * The output of Screen.render(). Fully describes what should appear in the Telegram message.
 *
 * Screens return this; the Renderer decides whether to editMessageText,
 * editMessageMedia, sendMessage, etc.
 */
export interface ScreenView {
  readonly text: string;
  readonly keyboard?: KeyboardDefinition;
  readonly parseMode?: ParseMode;
}

/**
 * Interface that every screen component must implement.
 *
 * Lifecycle order on entering a screen:
 *   beforeEnter() → resolve() [handled by engine] → render() → afterRender()
 *
 * On leaving:
 *   beforeLeave() → [navigate away] → onDestroy()
 *
 * All lifecycle hooks are optional except render().
 */
export interface ScreenComponent {
  /** Produce the message content for this screen. Must be pure / side-effect-free. */
  render(ctx: NavigationContext): Promise<ScreenView>;

  /** Called before guards run. Use for early redirects or telemetry. */
  beforeEnter?(ctx: NavigationContext): Promise<void>;

  /** Called after the message has been sent/edited. Use for side-effects. */
  afterRender?(ctx: NavigationContext): Promise<void>;

  /** Called when the user navigates away from this screen. */
  beforeLeave?(ctx: NavigationContext): Promise<void>;

  /** Called when the screen instance is discarded (e.g., history cleared). */
  onDestroy?(): Promise<void>;
}

/**
 * Constructor type for screen components.
 *
 * Phase 1: no-arg constructor (`new Ctor()`).
 * Phase 8 (DI): optionally declare a static `factory(injector)` to receive
 * injected services. The engine calls `factory` when an injector is configured,
 * falling back to `new Ctor()` for screens without a factory.
 *
 * @example
 * class EventScreen implements ScreenComponent {
 *   static factory(injector: Injector): EventScreen {
 *     return new EventScreen(injector.get(EVENT_SERVICE));
 *   }
 *   constructor(private readonly eventService: EventService) {}
 * }
 *
 * Phase 9: set `static readonly singleton = true` to have the registry reuse
 * the same instance across navigations. Use only for stateless screens.
 */
export type ScreenComponentConstructor =
  (new () => ScreenComponent) &
  { factory?: (injector: Injector) => ScreenComponent; singleton?: true };
