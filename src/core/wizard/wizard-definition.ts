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
   * Path navigated to when the wizard is cancelled or when the last step
   * calls nextStep() (completing the wizard).
   */
  readonly exitPath: string;
}
