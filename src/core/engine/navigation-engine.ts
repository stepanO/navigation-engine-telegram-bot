/**
 * NavigationEngine — the central orchestrator.
 *
 * Lifecycle for navigate(path, target):
 *   1. Resolve route via Router.
 *   2. Load or create NavigationStack for this user/chat.
 *   3. Build a partial NavigationContext (no data yet).
 *   4. Run global middleware chain.
 *   5. Run guards (in order). On redirect: recurse. On reject: throw.
 *   6. Run resolvers in parallel. Merge results into context.data.
 *   7. Instantiate screen via ScreenRegistry.
 *   8. Call screen.beforeEnter().
 *   9. Call screen.render() → ScreenView.
 *  10. Call renderer.render(view, target) → RenderResult.
 *  11. If RenderResult.messageId is set, store it in the stack.
 *  12. Call renderer.answerCallbackQuery(target).
 *  13. Call screen.afterRender().
 *  14. Push/replace/leave NavigationStack and persist state.
 *
 * NavigationEngine is framework-agnostic. The grammY adapter (Phase 2)
 * wraps it and translates grammY Context into RenderTarget + TelegramUser/Chat.
 */

import type { RouteDefinition, RouteMatch } from '../interfaces/route.js';
import type { TelegramUser, TelegramChat } from '../interfaces/navigation.js';
import type { RenderTarget, Renderer } from '../interfaces/renderer.js';
import type { StateStore } from '../interfaces/state.js';
import type { MiddlewareConstructor, NextFn } from '../interfaces/middleware.js';
import type { Injector } from '../di/injector.js';
import { NavigationGuardError, ResolverError, NoHistoryError } from '../interfaces/errors.js';
import { buildStateKey } from '../interfaces/state.js';
import { Router } from '../router/router.js';
import { ScreenRegistry, createInjectable } from '../registry/screen-registry.js';
import { NavigationStack } from './navigation-stack.js';
import { ConcreteNavigationContext } from './navigation-context.js';

export interface NavigationEngineConfig {
  readonly maxHistory?: number;
  /** Optional DI injector. When set, constructors that declare a static factory() receive injected services. */
  readonly injector?: Injector;
}

export class NavigationEngine {
  private readonly middlewares: MiddlewareConstructor[] = [];
  private readonly injector: Injector | undefined;
  private readonly resolverCache = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(
    private readonly router: Router,
    private readonly registry: ScreenRegistry,
    private readonly renderer: Renderer,
    private readonly stateStore: StateStore,
    private readonly config: NavigationEngineConfig = {},
  ) {
    this.injector = config.injector;
  }

  /**
   * Register a route with the engine.
   * Fluent API — returns `this` for chaining.
   */
  register(definition: RouteDefinition): this {
    this.router.register(definition);
    this.registry.register(definition);
    return this;
  }

  /**
   * Add a global middleware class.
   * Middleware runs before guards on every navigation, in registration order.
   */
  use(middleware: MiddlewareConstructor): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Navigate to `path`, pushing a new history entry.
   */
  async navigate(
    path: string,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    await this.executeNavigation(path, 'push', user, chat, target);
  }

  /**
   * Replace the current history entry with `path`.
   */
  async replace(
    path: string,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    await this.executeNavigation(path, 'replace', user, chat, target);
  }

  /**
   * Navigate to the previous history entry.
   */
  async back(
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<void> {
    const stateKey = buildStateKey(chat.id, user.id);
    const persisted = await this.stateStore.get(stateKey);
    const stack = new NavigationStack(chat.id, user.id, this.config.maxHistory, persisted);

    if (!stack.canGoBack()) {
      throw new NoHistoryError();
    }

    const previousEntry = stack.back();
    await this.executeNavigation(previousEntry.path, 'back', user, chat, target, stack);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async executeNavigation(
    path: string,
    mode: 'push' | 'replace' | 'back',
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
    existingStack?: NavigationStack,
  ): Promise<void> {
    const routeMatch = this.router.matchOrThrow(path);

    const stateKey = buildStateKey(chat.id, user.id);
    const stack = existingStack ?? await this.loadStack(stateKey, chat.id, user.id);

    const createCtx = (data: Record<string, unknown>) =>
      new ConcreteNavigationContext(
        routeMatch,
        user,
        chat,
        data,
        async (p, m) => {
          if (m === 'back') {
            await this.back(user, chat, target);
          } else {
            await this.executeNavigation(p, m, user, chat, target);
          }
        },
      );

    const middlewareData: Record<string, unknown> = {};
    const ctxForMiddleware = createCtx(middlewareData);

    await this.runMiddlewareChain(ctxForMiddleware, async () => {
      const { definition } = routeMatch;

      // ── Guards ────────────────────────────────────────────────────────────
      if (definition.guards) {
        for (const GuardCtor of definition.guards) {
          const guard = createInjectable(GuardCtor, this.injector);
          const result = await guard.canActivate(ctxForMiddleware);

          if (!result.allowed) {
            if ('redirect' in result && result.redirect) {
              await this.executeNavigation(result.redirect, 'push', user, chat, target);
              return;
            }
            const msg = 'message' in result ? (result.message ?? 'Access denied') : 'Access denied';
            throw new NavigationGuardError(path, msg);
          }
        }
      }

      // ── Resolvers ─────────────────────────────────────────────────────────
      const resolvedData = await this.runResolvers(routeMatch, ctxForMiddleware, user, chat);
      const fullData = { ...definition.data, ...middlewareData, ...resolvedData };
      const ctxForRender = createCtx(fullData);

      // ── Screen lifecycle ───────────────────────────────────────────────────
      const screen = this.registry.createScreen(definition.path, this.injector);
      await screen.beforeEnter?.(ctxForRender);

      const view = await screen.render(ctxForRender);
      const renderResult = await this.renderer.render(view, target);

      // If the renderer sent a new message, persist its ID for future edits.
      if (renderResult.messageId !== undefined) {
        stack.updateMessageId(renderResult.messageId);
      }

      await this.renderer.answerCallbackQuery(target);
      await screen.afterRender?.(ctxForRender);

      // ── History update ─────────────────────────────────────────────────────
      if (mode === 'push') {
        stack.push(routeMatch);
      } else if (mode === 'replace') {
        stack.replace(routeMatch);
      }
      // 'back' mode: cursor already moved before entering executeNavigation.

      await this.stateStore.set(stateKey, stack.toState());
    });
  }

  private async loadStack(
    stateKey: string,
    chatId: number,
    userId: number,
  ): Promise<NavigationStack> {
    const persisted = await this.stateStore.get(stateKey);
    return new NavigationStack(chatId, userId, this.config.maxHistory, persisted);
  }

  private async runMiddlewareChain(
    ctx: ConcreteNavigationContext,
    coreHandler: NextFn,
  ): Promise<void> {
    const instances = this.middlewares.map(Ctor => createInjectable(Ctor, this.injector));

    const execute = async (index: number): Promise<void> => {
      if (index >= instances.length) {
        await coreHandler();
        return;
      }
      await instances[index]!.handle(ctx, () => execute(index + 1));
    };

    await execute(0);
  }

  private async runResolvers(
    match: RouteMatch,
    ctx: ConcreteNavigationContext,
    user: TelegramUser,
    chat: TelegramChat,
  ): Promise<Record<string, unknown>> {
    const { resolvers } = match.definition;
    if (!resolvers) return {};

    const entries = Object.entries(resolvers);
    const results = await Promise.allSettled(
      entries.map(async ([key, ResolverCtor]) => {
        if (ResolverCtor.cacheTtl !== undefined) {
          const cacheKey = this.resolverCacheKey(chat.id, user.id, match, key);
          const cached = this.resolverCache.get(cacheKey);
          if (cached !== undefined && Date.now() < cached.expiresAt) {
            return { key, value: cached.value };
          }
          const resolver = createInjectable(ResolverCtor, this.injector);
          const value = await resolver.resolve(ctx);
          this.resolverCache.set(cacheKey, {
            value,
            expiresAt: Date.now() + ResolverCtor.cacheTtl,
          });
          return { key, value };
        }
        const resolver = createInjectable(ResolverCtor, this.injector);
        const value = await resolver.resolve(ctx);
        return { key, value };
      }),
    );

    const data: Record<string, unknown> = {};
    for (const result of results) {
      if (result.status === 'rejected') {
        const failedIndex = results.indexOf(result);
        const entry = entries[failedIndex];
        throw new ResolverError(entry?.[0] ?? 'unknown', result.reason);
      }
      data[result.value.key] = result.value.value;
    }

    return data;
  }

  private resolverCacheKey(
    chatId: number,
    userId: number,
    match: RouteMatch,
    resolverKey: string,
  ): string {
    return `${chatId}:${userId}:${match.definition.path}:${resolverKey}:${JSON.stringify(match.params)}`;
  }
}
