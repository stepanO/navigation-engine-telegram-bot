import type { WizardScreenConstructor } from './wizard-screen.js';

/** A single step in a wizard flow, bound to a WizardScreen class. */
export interface WizardStep {
  readonly screen: WizardScreenConstructor;
}

/**
 * Declarative definition of a multi-step wizard.
 *
 * @example
 * const createEventWizard: WizardDefinition = {
 *   id: 'createEvent',
 *   steps: [
 *     { screen: NameStep },
 *     { screen: DateStep },
 *     { screen: ConfirmStep },
 *   ],
 *   exitPath: '/events',
 * };
 */
export interface WizardDefinition {
  /** Unique identifier for this wizard. Used as part of the state store key. */
  readonly id: string;
  /** Ordered list of steps. Index 0 is rendered first. */
  readonly steps: readonly WizardStep[];
  /**
   * When true, the engine deletes the user's incoming text message after
   * a wizard text step handles it. Keeps the chat clean during wizard flows.
   * Defaults to false.
   */
  readonly deleteUserMessage?: boolean;
  /**
   * Path navigated to when the wizard is cancelled or when the last step
   * calls nextStep() (completing the wizard).
   *
   * Accepts a factory function that receives the accumulated wizard data so the
   * destination can be derived from params collected during the flow, e.g.:
   *   exitPath: (data) => `/events/${data.eventId}`
   */
  readonly exitPath: string | ((data: Record<string, unknown>) => string);
}
