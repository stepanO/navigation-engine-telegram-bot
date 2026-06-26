/**
 * GrammYNavigationEngine — single-entry-point convenience wrapper.
 *
 * Wires together NavigationEngine + GrammYRenderer + GrammYAdapter so that
 * a typical bot only needs to interact with this one class.
 *
 * @example
 * import { Bot } from 'grammy';
 * import { GrammYNavigationEngine } from './adapter/grammy/grammy-navigation-engine';
 *
 * const bot = new Bot(process.env.BOT_TOKEN!);
 * const nav = new GrammYNavigationEngine(bot.api);
 *
 * nav
 *   .register({ path: '/',          component: HomeScreen })
 *   .register({ path: '/events',    component: EventsScreen })
 *   .register({ path: '/events/:id', component: EventScreen });
 *
 * nav.registerAction('deleteEvent', DeleteEventHandler);
 *
 * bot.use(nav.middleware());
 * bot.command('start', ctx => nav.navigate(ctx, '/'));
 * bot.start();
 */

import type { Api, Context, MiddlewareFn } from 'grammy';
import type { RouteDefinition } from '../../core/interfaces/route.js';
import type { MiddlewareConstructor } from '../../core/interfaces/middleware.js';
import type { StateStore } from '../../core/interfaces/state.js';
import type { RenderTarget } from '../../core/interfaces/renderer.js';
import type { TelegramUser, TelegramChat } from '../../core/interfaces/navigation.js';
import type { CallbackDataEncoder } from '../../callback/callback-encoder.js';
import type { ActionHandlerConstructor } from '../../core/action/action-context.js';
import type { Injector } from '../../core/di/injector.js';
import type { WizardDefinition } from '../../core/wizard/wizard-definition.js';
import type { WizardStateStore } from '../../core/wizard/wizard-state.js';
import type { NavigationEngineConfig } from '../../core/engine/navigation-engine.js';
import { Router } from '../../core/router/router.js';
import { ScreenRegistry } from '../../core/registry/screen-registry.js';
import { InMemoryStateStore } from '../../core/state/in-memory-state-store.js';
import { NavigationEngine } from '../../core/engine/navigation-engine.js';
import { SimpleCallbackEncoder } from '../../callback/callback-encoder.js';
import { ActionDispatcher } from '../../core/action/action-dispatcher.js';
import { WizardNavigationEngine } from '../../core/wizard/wizard-navigation-engine.js';
import { InMemoryWizardStateStore } from '../../core/wizard/wizard-state.js';
import { GrammYRenderer } from './grammy-renderer.js';
import { GrammYAdapter } from './grammy-adapter.js';
import { extractTelegramUser, extractTelegramChat } from './context-extractors.js';
import { buildStateKey } from '../../core/interfaces/state.js';

export interface GrammYNavigationEngineOptions {
  /** Swap in a Redis / Postgres store for production deployments. */
  readonly stateStore?: StateStore;
  /** Custom callback encoder. Default: SimpleCallbackEncoder. */
  readonly encoder?: CallbackDataEncoder;
  /** Maximum history depth per user. Default: 50. */
  readonly maxHistory?: number;
  /** DI injector. When set, screens/guards/resolvers/middleware with a static factory() receive injected services. */
  readonly injector?: Injector;
  /** State store for wizard sessions. Default: InMemoryWizardStateStore. */
  readonly wizardStateStore?: WizardStateStore;
  /**
   * Called when a navigation error bubbles up from middleware (RouteNotFoundError,
   * NavigationGuardError, ResolverError, etc.). If not set the error is re-thrown.
   */
  readonly onError?: (error: unknown, ctx: Context) => Promise<void>;
  /**
   * Called after every successful navigation with timing data.
   * Useful for logging, metrics, or debugging resolver latency.
   */
  readonly onNavigate?: (event: {
    path: string;
    userId: number;
    chatId: number;
    resolverDurationsMs: Record<string, number>;
    totalDurationMs: number;
  }) => void;
}

export class GrammYNavigationEngine {
  private readonly engine: NavigationEngine;
  private readonly adapter: GrammYAdapter;
  private readonly dispatcher: ActionDispatcher;
  private readonly encoder: CallbackDataEncoder;
  private readonly renderer: GrammYRenderer;
  private readonly stateStore: StateStore;
  private readonly wizardStateStore: WizardStateStore;
  private readonly onError: ((error: unknown, ctx: Context) => Promise<void>) | undefined;
  private wizardEngine?: WizardNavigationEngine;

  constructor(
    api: Api,
    options: GrammYNavigationEngineOptions = {},
  ) {
    this.renderer = new GrammYRenderer(api);
    this.stateStore = options.stateStore ?? new InMemoryStateStore();
    this.wizardStateStore = options.wizardStateStore ?? new InMemoryWizardStateStore();
    this.encoder = options.encoder ?? new SimpleCallbackEncoder();
    this.onError = options.onError;

    // Forward-ref so the wizard cancel fn can be wired after lazy init.
    const cancelRef = {
      fn: async (_user: TelegramUser, _chat: TelegramChat, _wizardId?: string) => {},
    };

    const engineConfig: NavigationEngineConfig = {
      ...(options.maxHistory !== undefined ? { maxHistory: options.maxHistory } : {}),
      ...(options.injector !== undefined ? { injector: options.injector } : {}),
      ...(options.onNavigate !== undefined ? { onNavigate: options.onNavigate } : {}),
      cancelActiveWizardFn: (user, chat, wizardId) => cancelRef.fn(user, chat, wizardId),
    };

    this.engine = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      this.renderer,
      this.stateStore,
      engineConfig,
    );

    this.dispatcher = new ActionDispatcher();
    this.adapter = new GrammYAdapter(this.engine, this.stateStore, this.encoder, this.dispatcher);

    // Bind cancelRef after all fields are set so the closure captures `this`.
    cancelRef.fn = async (user, chat, wizardId) => {
      if (!this.wizardEngine) return;
      const we = this.wizardEngine;
      const target = await this.buildRenderTargetForIds(chat.id, user.id);
      if (wizardId !== undefined) {
        await we.cancel(wizardId, user, chat, target);
      } else {
        const activeId = await we.getActiveWizardId(chat.id, user.id);
        if (activeId !== undefined) {
          await we.cancel(activeId, user, chat, target);
        }
      }
    };
  }

  /**
   * Register a route. Fluent — returns `this` for chaining.
   *
   * If the configured encoder exposes a `registerRoute(path)` method
   * (e.g. CompactCallbackEncoder), it is called automatically so the
   * encoder's route registry stays in sync without extra boilerplate.
   */
  register(definition: RouteDefinition): this {
    this.engine.register(definition);
    if ('registerRoute' in this.encoder && typeof (this.encoder as { registerRoute?: unknown }).registerRoute === 'function') {
      (this.encoder as { registerRoute: (path: string, stableId?: string) => void })
        .registerRoute(definition.path, definition.stableId);
    }
    return this;
  }

  /**
   * Register a wizard definition. Fluent — returns `this` for chaining.
   *
   * @example
   * nav.registerWizard({ id: 'createEvent', steps: [...], exitPath: '/events' });
   * bot.command('create', ctx => nav.startWizard(ctx, 'createEvent'));
   */
  registerWizard(definition: WizardDefinition): this {
    this.getOrCreateWizardEngine().define(definition);
    return this;
  }

  /**
   * Start a wizard session for the user in the given grammY context.
   * Renders the first step into the current message (or sends a new message).
   */
  async startWizard(ctx: Context, wizardId: string): Promise<void> {
    if (!ctx.from || !ctx.chat) {
      throw new Error('startWizard requires ctx.from and ctx.chat');
    }
    const user = extractTelegramUser(ctx.from);
    const chat = extractTelegramChat(ctx.chat);
    const target = await this.buildRenderTarget(ctx);
    await this.getOrCreateWizardEngine().start(wizardId, user, chat, target);
  }

  /**
   * Cancel the active wizard session for the user in the given grammY context.
   * Navigates to the wizard's configured exitPath.
   */
  async cancelWizard(ctx: Context, wizardId: string): Promise<void> {
    if (!ctx.from || !ctx.chat) {
      throw new Error('cancelWizard requires ctx.from and ctx.chat');
    }
    const user = extractTelegramUser(ctx.from);
    const chat = extractTelegramChat(ctx.chat);
    const target = await this.buildRenderTarget(ctx);
    await this.getOrCreateWizardEngine().cancel(wizardId, user, chat, target);
  }

  /**
   * Add a global navigation middleware. Runs before guards on every navigation.
   */
  use(middleware: MiddlewareConstructor): this {
    this.engine.use(middleware);
    return this;
  }

  /**
   * Register an action handler for the given action name.
   * The name must match what is passed to `Button.action(text, name)`.
   * Fluent — returns `this` for chaining.
   *
   * @example
   * nav.registerAction('deleteEvent', DeleteEventHandler);
   */
  registerAction(name: string, handler: ActionHandlerConstructor): this {
    this.dispatcher.register(name, handler);
    return this;
  }

  /**
   * Returns a grammY MiddlewareFn that intercepts nav:/action: callback queries
   * and message:text updates for active wizard steps.
   * Register once with bot.use(nav.middleware()).
   */
  middleware(): MiddlewareFn<Context> {
    const adapterMiddleware = this.adapter.middleware();
    return async (ctx, next) => {
      try {
        if (ctx.callbackQuery?.data) {
          await adapterMiddleware(ctx, next);
          return;
        }

        if (this.wizardEngine && ctx.message?.text && ctx.from && ctx.chat) {
          const user = extractTelegramUser(ctx.from);
          const chat = extractTelegramChat(ctx.chat);
          const wizardId = await this.wizardEngine.getActiveWizardId(chat.id, user.id);
          if (wizardId !== undefined) {
            const target = await this.buildRenderTarget(ctx);
            const handled = await this.wizardEngine.tryHandleText(
              wizardId, ctx.message.text, user, chat, target,
            );
            if (handled) return;
          }
        }

        await next();
      } catch (err) {
        if (this.onError) {
          await this.onError(err, ctx);
        } else {
          throw err;
        }
      }
    };
  }

  /**
   * Programmatically navigate from any grammY handler.
   *
   * @example
   * bot.command('start', ctx => nav.navigate(ctx, '/'));
   */
  async navigate(ctx: Context, path: string): Promise<void> {
    await this.adapter.navigateFromContext(ctx, path);
  }

  /**
   * Programmatically replace the current history entry from any grammY handler.
   */
  async replace(ctx: Context, path: string): Promise<void> {
    await this.adapter.replaceFromContext(ctx, path);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private getOrCreateWizardEngine(): WizardNavigationEngine {
    if (!this.wizardEngine) {
      this.wizardEngine = new WizardNavigationEngine(
        this.renderer,
        this.wizardStateStore,
        (path, user, chat, target) => this.engine.navigate(path, user, chat, target),
      );
    }
    return this.wizardEngine;
  }

  /**
   * Builds a RenderTarget from a grammY Context.
   * Used for wizard text-message handling where there is no callback query.
   */
  private async buildRenderTarget(ctx: Context): Promise<RenderTarget> {
    const chatId = ctx.chat!.id;
    const userId = ctx.from!.id;
    const state = await this.stateStore.get(buildStateKey(chatId, userId));
    const messageId = state?.messageId ?? ctx.message?.message_id;
    return messageId !== undefined ? { chatId, userId, messageId } : { chatId, userId };
  }

  /** Builds a RenderTarget from bare IDs only (used in cancelActiveWizard path). */
  private async buildRenderTargetForIds(chatId: number, userId: number): Promise<RenderTarget> {
    const state = await this.stateStore.get(buildStateKey(chatId, userId));
    const messageId = state?.messageId;
    return messageId !== undefined ? { chatId, userId, messageId } : { chatId, userId };
  }
}
