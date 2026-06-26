/**
 * WizardNavigationEngine — orchestrates multi-step conversational flows.
 *
 * Each wizard is defined with an ordered list of WizardScreen steps and an
 * exit path. State (current step + accumulated data) is persisted in the
 * WizardStateStore so wizards survive bot restarts.
 *
 * Public API:
 *   start()  — begin a fresh wizard session, render step 1
 *   nextStep() — merge data, advance to next step (or complete wizard)
 *   prevStep() — go back one step
 *   cancel()  — discard wizard state, navigate to exitPath
 *   resume()  — re-render the current step from persisted state
 *
 * The WizardContext passed to each step screen also exposes nextStep/prevStep/
 * cancelWizard as convenience methods so screens can drive progress themselves.
 *
 * Dependency on the nav engine: navigateFn is an injected callback so the wizard
 * engine stays framework-agnostic. The grammY adapter provides this callback.
 */

import type { TelegramUser, TelegramChat } from '../interfaces/navigation.js';
import type { Renderer, RenderTarget } from '../interfaces/renderer.js';
import type { RouteMatch } from '../interfaces/route.js';
import type { ScreenComponentConstructor } from '../interfaces/screen.js';
import type { WizardDefinition, WizardStep } from './wizard-definition.js';
import type { WizardStateStore, WizardState } from './wizard-state.js';
import {
  WizardNotFoundError,
  WizardNotActiveError,
  WizardAtFirstStepError,
} from '../interfaces/errors.js';
import { buildWizardKey, buildWizardState } from './wizard-state.js';
import { ConcreteWizardContext, ConcreteWizardTextContext } from './wizard-context.js';

/**
 * Callback that hands off to the main navigation engine.
 * Called by cancelWizard(), nextStep() on the last step, and ctx.navigate/replace().
 */
export type WizardExitFn = (
  path: string,
  user: TelegramUser,
  chat: TelegramChat,
  target: RenderTarget,
) => Promise<void>;

export class WizardNavigationEngine {
  private readonly wizards = new Map<string, WizardDefinition>();
  /** Tracks which wizard is active per user/chat. Key: `${chatId}:${userId}`, value: wizardId. */
  private readonly activeWizardByUser = new Map<string, string>();

  constructor(
    private readonly renderer: Renderer,
    private readonly stateStore: WizardStateStore,
    private readonly exitFn: WizardExitFn,
  ) {}

  /**
   * Register a wizard definition. Fluent — returns `this` for chaining.
   */
  define(definition: WizardDefinition): this {
    this.wizards.set(definition.id, definition);
    return this;
  }

  /** Returns the ID of the currently active wizard for the given user/chat, or undefined. */
  async getActiveWizardId(chatId: number, userId: number): Promise<string | undefined> {
    return this.activeWizardByUser.get(`${chatId}:${userId}`);
  }

  /**
   * Handle a text message for the active wizard's current step.
   * Returns true if `awaitText` was set and `onText` was called.
   * Returns false if the current step does not expect text input.
   */
  async tryHandleText(
    wizardId: string,
    text: string,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
    incomingMessageId?: number,
  ): Promise<boolean> {
    const def = this.wizards.get(wizardId);
    if (!def) return false;
    const state = await this.stateStore.get(buildWizardKey(chat.id, user.id, wizardId));
    if (!state) return false;
    const stepDef = def.steps[state.stepIndex];
    if (!stepDef) return false;
    const screen = new stepDef.screen();
    if (!screen.awaitText || !screen.onText) return false;

    const syntheticRoute = this.buildSyntheticRoute(def.id, state.stepIndex, stepDef);
    const ctx = new ConcreteWizardTextContext(
      syntheticRoute, user, chat, {},
      state.stepIndex + 1, state.totalSteps, state.data,
      async (data) => this.advanceStep(def, state, data, user, chat, target),
      async () => this.retreatStep(def, state, user, chat, target),
      async () => this.cancelInternal(def, state, user, chat, target),
      async (path, mode) => {
        if (mode === 'back') {
          await this.retreatStep(def, state, user, chat, target);
        } else {
          await this.exitFn(path, user, chat, target);
        }
      },
      text,
    );
    const result = await screen.onText(ctx);
    if (result !== undefined) {
      const renderResult = await this.renderer.render(result, target);
      if (renderResult.messageId !== undefined) {
        const key = buildWizardKey(chat.id, user.id, def.id);
        const currentState = await this.stateStore.get(key);
        if (currentState) {
          await this.stateStore.set(
            key,
            buildWizardState({ ...currentState, messageId: renderResult.messageId }),
          );
        }
      }
    }
    if (def.deleteUserMessage && incomingMessageId !== undefined) {
      await this.renderer.deleteMessage(chat.id, incomingMessageId);
    }
    return true;
  }

  /**
   * Start a fresh wizard session and render the first step.
   * Any existing session for this wizard/user/chat is replaced.
   */
  async start(
    wizardId: string,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    const def = this.requireWizard(wizardId);
    this.activeWizardByUser.set(`${chat.id}:${user.id}`, wizardId);
    const key = buildWizardKey(chat.id, user.id, wizardId);

    const state = buildWizardState({
      wizardId,
      stepIndex: 0,
      totalSteps: def.steps.length,
      data: {},
      exitPath: typeof def.exitPath === 'string' ? def.exitPath : '',
      messageId: undefined,
    });
    await this.stateStore.set(key, state);
    await this.renderStep(def, state, user, chat, target);
  }

  /**
   * Advance to the next step, merging `data` into accumulated wizard data.
   * On the final step, the wizard is completed and exitFn is called with exitPath.
   */
  async nextStep(
    wizardId: string,
    data: Record<string, unknown> | undefined,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    const def = this.requireWizard(wizardId);
    const state = await this.requireActiveState(wizardId, chat.id, user.id);
    await this.advanceStep(def, state, data, user, chat, target);
  }

  /**
   * Go back to the previous step.
   * Throws WizardAtFirstStepError if already on step 1.
   */
  async prevStep(
    wizardId: string,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    const def = this.requireWizard(wizardId);
    const state = await this.requireActiveState(wizardId, chat.id, user.id);
    await this.retreatStep(def, state, user, chat, target);
  }

  /**
   * Cancel the wizard: delete its state and navigate to exitPath.
   */
  async cancel(
    wizardId: string,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    const def = this.requireWizard(wizardId);
    const state = await this.requireActiveState(wizardId, chat.id, user.id);
    await this.cancelInternal(def, state, user, chat, target);
  }

  /**
   * Re-render the current step from persisted state.
   * Used to restore the wizard UI after a bot restart.
   */
  async resume(
    wizardId: string,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    const def = this.requireWizard(wizardId);
    const state = await this.requireActiveState(wizardId, chat.id, user.id);
    await this.renderStep(def, state, user, chat, target);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private requireWizard(wizardId: string): WizardDefinition {
    const def = this.wizards.get(wizardId);
    if (!def) throw new WizardNotFoundError(wizardId);
    return def;
  }

  private async requireActiveState(
    wizardId: string,
    chatId: number,
    userId: number,
  ): Promise<WizardState> {
    const key = buildWizardKey(chatId, userId, wizardId);
    const state = await this.stateStore.get(key);
    if (!state) throw new WizardNotActiveError(wizardId);
    return state;
  }

  private async advanceStep(
    def: WizardDefinition,
    state: WizardState,
    data: Record<string, unknown> | undefined,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    const merged = data ? { ...state.data, ...data } : { ...state.data };
    const key = buildWizardKey(chat.id, user.id, def.id);

    if (state.stepIndex >= state.totalSteps - 1) {
      // Last step complete — clean up and hand off to nav engine
      this.activeWizardByUser.delete(`${chat.id}:${user.id}`);
      await this.stateStore.delete(key);
      await this.exitFn(this.resolveExitPath(def, merged), user, chat, target);
    } else {
      const newState = buildWizardState({
        wizardId: state.wizardId,
        stepIndex: state.stepIndex + 1,
        totalSteps: state.totalSteps,
        data: merged,
        exitPath: state.exitPath,
        messageId: state.messageId,
      });
      await this.stateStore.set(key, newState);
      await this.renderStep(def, newState, user, chat, target);
    }
  }

  private async retreatStep(
    def: WizardDefinition,
    state: WizardState,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    if (state.stepIndex === 0) {
      throw new WizardAtFirstStepError();
    }
    const key = buildWizardKey(chat.id, user.id, def.id);
    const newState = buildWizardState({
      wizardId: state.wizardId,
      stepIndex: state.stepIndex - 1,
      totalSteps: state.totalSteps,
      data: state.data,
      exitPath: state.exitPath,
      messageId: state.messageId,
    });
    await this.stateStore.set(key, newState);
    await this.renderStep(def, newState, user, chat, target);
  }

  private async cancelInternal(
    def: WizardDefinition,
    state: WizardState,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    this.activeWizardByUser.delete(`${chat.id}:${user.id}`);
    const key = buildWizardKey(chat.id, user.id, state.wizardId);
    await this.stateStore.delete(key);
    await this.exitFn(this.resolveExitPath(def, state.data), user, chat, target);
  }

  private async renderStep(
    def: WizardDefinition,
    state: WizardState,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    const stepDef = def.steps[state.stepIndex] as WizardStep;
    const screen = new stepDef.screen();

    const syntheticRoute = this.buildSyntheticRoute(def.id, state.stepIndex, stepDef);

    const ctx = new ConcreteWizardContext(
      syntheticRoute,
      user,
      chat,
      {},
      state.stepIndex + 1,
      state.totalSteps,
      state.data,
      async (data) => this.advanceStep(def, state, data, user, chat, target),
      async () => this.retreatStep(def, state, user, chat, target),
      async () => this.cancelInternal(def, state, user, chat, target),
      async (path, mode) => {
        if (mode === 'back') {
          await this.retreatStep(def, state, user, chat, target);
        } else {
          await this.exitFn(path, user, chat, target);
        }
      },
    );

    const view = await screen.onStep(ctx);
    const renderResult = await this.renderer.render(view, target);

    // Persist new messageId if the renderer sent a new message.
    if (renderResult.messageId !== undefined) {
      const key = buildWizardKey(chat.id, user.id, def.id);
      const currentState = await this.stateStore.get(key);
      if (currentState) {
        await this.stateStore.set(
          key,
          buildWizardState({ ...currentState, messageId: renderResult.messageId }),
        );
      }
    }

    await this.renderer.answerCallbackQuery(target);
  }

  private resolveExitPath(def: WizardDefinition, data: Record<string, unknown>): string {
    return typeof def.exitPath === 'function' ? def.exitPath(data) : def.exitPath;
  }

  private buildSyntheticRoute(
    wizardId: string,
    stepIndex: number,
    stepDef: WizardStep,
  ): RouteMatch {
    const path = `/wizard/${wizardId}/step/${stepIndex}`;
    return {
      definition: {
        path,
        // WizardScreen is not a ScreenComponent but the route field is only
        // read structurally by guards/resolvers, never instantiated via this ref.
        component: stepDef.screen as unknown as ScreenComponentConstructor,
      },
      params: {},
      query: {},
      fullPath: path,
      pathOnly: path,
    };
  }
}
