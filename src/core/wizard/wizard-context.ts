/**
 * WizardContext — the context object passed to each wizard step screen.
 *
 * Extends NavigationContext with wizard-specific state and navigation methods.
 * The `back()` method goes to the previous wizard step (not the nav history).
 * `navigate()` and `replace()` exit the wizard and hand off to the navigation engine.
 */

import type { NavigationContext, TelegramUser, TelegramChat } from '../interfaces/navigation.js';
import type { RouteMatch, RouteParams, QueryParams } from '../interfaces/route.js';

export interface WizardContext extends NavigationContext {
  /** Current step number, 1-indexed. */
  readonly step: number;
  /** Total number of steps in the wizard. */
  readonly totalSteps: number;
  /** Data accumulated from all previously completed steps. */
  readonly wizardData: Record<string, unknown>;

  /**
   * Advance to the next step, merging `data` into the accumulated wizard data.
   * On the last step this completes the wizard and navigates to `exitPath`.
   */
  nextStep(data?: Record<string, unknown>): Promise<void>;

  /** Go back to the previous step. Throws WizardAtFirstStepError on step 1. */
  prevStep(): Promise<void>;

  /** Cancel the wizard and navigate to the configured exitPath. */
  cancelWizard(): Promise<void>;
}

export type WizardNextStepFn = (data?: Record<string, unknown>) => Promise<void>;
export type WizardPrevStepFn = () => Promise<void>;
export type WizardCancelFn = () => Promise<void>;
export type WizardNavigateFn = (path: string, mode: 'push' | 'replace' | 'back') => Promise<void>;

export class ConcreteWizardContext implements WizardContext {
  readonly params: RouteParams;
  readonly query: QueryParams;
  readonly route: RouteMatch;
  readonly user: TelegramUser;
  readonly chat: TelegramChat;
  readonly data: Record<string, unknown>;

  constructor(
    route: RouteMatch,
    user: TelegramUser,
    chat: TelegramChat,
    data: Record<string, unknown>,
    readonly step: number,
    readonly totalSteps: number,
    readonly wizardData: Record<string, unknown>,
    private readonly nextStepFn: WizardNextStepFn,
    private readonly prevStepFn: WizardPrevStepFn,
    private readonly cancelFn: WizardCancelFn,
    private readonly navigateFn: WizardNavigateFn,
  ) {
    this.route = route;
    this.params = route.params;
    this.query = route.query;
    this.user = user;
    this.chat = chat;
    this.data = data;
  }

  async navigate(path: string): Promise<void> {
    await this.navigateFn(path, 'push');
  }

  async replace(path: string): Promise<void> {
    await this.navigateFn(path, 'replace');
  }

  /** Goes to the previous wizard step (not the nav history). */
  async back(): Promise<void> {
    await this.prevStepFn();
  }

  async nextStep(data?: Record<string, unknown>): Promise<void> {
    await this.nextStepFn(data);
  }

  async prevStep(): Promise<void> {
    await this.prevStepFn();
  }

  async cancelWizard(): Promise<void> {
    await this.cancelFn();
  }
}
