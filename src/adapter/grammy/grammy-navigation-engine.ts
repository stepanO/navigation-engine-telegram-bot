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
import type { CallbackDataEncoder } from '../../callback/callback-encoder.js';
import type { ActionHandlerConstructor } from '../../core/action/action-context.js';
import type { Injector } from '../../core/di/injector.js';
import { Router } from '../../core/router/router.js';
import { ScreenRegistry } from '../../core/registry/screen-registry.js';
import { InMemoryStateStore } from '../../core/state/in-memory-state-store.js';
import { NavigationEngine } from '../../core/engine/navigation-engine.js';
import { SimpleCallbackEncoder } from '../../callback/callback-encoder.js';
import { ActionDispatcher } from '../../core/action/action-dispatcher.js';
import { GrammYRenderer } from './grammy-renderer.js';
import { GrammYAdapter } from './grammy-adapter.js';

export interface GrammYNavigationEngineOptions {
  /** Swap in a Redis / Postgres store for production deployments. */
  readonly stateStore?: StateStore;
  /** Custom callback encoder. Default: SimpleCallbackEncoder. */
  readonly encoder?: CallbackDataEncoder;
  /** Maximum history depth per user. Default: 50. */
  readonly maxHistory?: number;
  /** DI injector. When set, screens/guards/resolvers/middleware with a static factory() receive injected services. */
  readonly injector?: Injector;
}

export class GrammYNavigationEngine {
  private readonly engine: NavigationEngine;
  private readonly adapter: GrammYAdapter;
  private readonly dispatcher: ActionDispatcher;
  private readonly encoder: CallbackDataEncoder;

  constructor(
    api: Api,
    options: GrammYNavigationEngineOptions = {},
  ) {
    const stateStore = options.stateStore ?? new InMemoryStateStore();
    this.encoder = options.encoder ?? new SimpleCallbackEncoder();
    const encoder = this.encoder;
    const renderer = new GrammYRenderer(api);

    const engineConfig: { maxHistory?: number; injector?: Injector } = {};
    if (options.maxHistory !== undefined) engineConfig.maxHistory = options.maxHistory;
    if (options.injector !== undefined) engineConfig.injector = options.injector;

    this.engine = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      renderer,
      stateStore,
      engineConfig,
    );

    this.dispatcher = new ActionDispatcher();
    this.adapter = new GrammYAdapter(this.engine, stateStore, encoder, this.dispatcher);
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
      (this.encoder as { registerRoute: (path: string) => void }).registerRoute(definition.path);
    }
    return this;
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
   * Returns a grammY MiddlewareFn that intercepts nav:/action: callback queries.
   * Register once with bot.use(nav.middleware()).
   */
  middleware(): MiddlewareFn<Context> {
    return this.adapter.middleware();
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
}
