import type { ScreenView } from '../interfaces/screen.js';
import type { WizardCallbackContext, WizardContext, WizardTextContext } from './wizard-context.js';

/**
 * Base class for all wizard step screens.
 *
 * Implement `onStep(ctx)` instead of `render()`.
 * The wizard engine calls `onStep()` directly; these screens are never registered
 * with the navigation router.
 *
 * To accept free-text input at a step, set `readonly awaitText = true as const`
 * and implement `onText(ctx)`. The engine will intercept the next `message:text`
 * update for the active user and call `onText` instead of passing it downstream.
 *
 * @example
 * class NameStep extends WizardScreen {
 *   readonly awaitText = true as const;
 *
 *   async onStep(ctx: WizardContext): Promise<ScreenView> {
 *     return { text: 'What is the event name?' };
 *   }
 *
 *   async onText(ctx: WizardTextContext): Promise<ScreenView | void> {
 *     if (!ctx.text.trim()) return { text: 'Name cannot be empty. Try again:' };
 *     await ctx.nextStep({ name: ctx.text.trim() });
 *   }
 * }
 */
export abstract class WizardScreen {
  /** When true the engine intercepts the next message:text for the active user at this step. */
  readonly awaitText?: true;

  abstract onStep(ctx: WizardContext): Promise<ScreenView>;

  /**
   * Called when `awaitText` is true and the user sends a text message.
   * Return a `ScreenView` to re-render the step (e.g. validation error).
   * Return `void` to signal the step handled the input internally (called nextStep etc.).
   */
  onText?(ctx: WizardTextContext): Promise<ScreenView | void>;

  /**
   * Called when the user presses any inline button while this step is active.
   *
   * When defined, the engine intercepts ALL callback queries for the active wizard
   * user and routes them here instead of the navigation adapter. This is the
   * mechanism for implementing date pickers, option selectors, or any other
   * inline-keyboard-driven wizard step.
   *
   * Return a `ScreenView` to re-render the step (e.g. show a validation error).
   * Return `void` after calling ctx.nextStep(), ctx.prevStep(), ctx.cancelWizard(),
   * or ctx.answerCallbackQuery() — the step has handled the interaction itself.
   */
  onCallback?(ctx: WizardCallbackContext): Promise<ScreenView | void>;
}

export type WizardScreenConstructor = new () => WizardScreen;
