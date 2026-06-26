import type { ScreenView } from '../interfaces/screen.js';
import type { WizardContext } from './wizard-context.js';

/**
 * Base class for all wizard step screens.
 *
 * Implement `onStep(ctx)` instead of `render()`.
 * The wizard engine calls `onStep()` directly; these screens are never registered
 * with the navigation router.
 *
 * @example
 * class NameStep extends WizardScreen {
 *   async onStep(ctx: WizardContext): Promise<ScreenView> {
 *     return ScreenBuilder.create()
 *       .section(TitleComponent(`Step ${ctx.step} of ${ctx.totalSteps}`))
 *       .text('What is the event name?')
 *       .build();
 *   }
 * }
 */
export abstract class WizardScreen {
  abstract onStep(ctx: WizardContext): Promise<ScreenView>;
}

export type WizardScreenConstructor = new () => WizardScreen;
