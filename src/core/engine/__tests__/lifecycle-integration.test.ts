/**
 * Phase 4 integration tests: full navigation lifecycle.
 *
 * Each test exercises a realistic combination of middleware + guards + resolvers
 * so that interactions between lifecycle phases are verified end-to-end.
 */

import { NavigationEngine } from '../navigation-engine.js';
import { Router } from '../../router/router.js';
import { ScreenRegistry } from '../../registry/screen-registry.js';
import { InMemoryStateStore } from '../../state/in-memory-state-store.js';
import { NavigationGuardError, ResolverError } from '../../interfaces/errors.js';
import { BaseGuard } from '../../guards/base-guard.js';
import { IsAuthenticatedGuard } from '../../guards/is-authenticated-guard.js';
import { BaseResolver } from '../../resolvers/base-resolver.js';
import { BaseMiddleware } from '../../middleware/base-middleware.js';
import type { ScreenComponent, ScreenView } from '../../interfaces/screen.js';
import type { NavigationContext, TelegramUser, TelegramChat } from '../../interfaces/navigation.js';
import type { RenderTarget, Renderer, RenderResult } from '../../interfaces/renderer.js';
import type { GuardResult } from '../../interfaces/guard.js';
import type { NextFn } from '../../interfaces/middleware.js';

// ─── Shared test doubles ──────────────────────────────────────────────────────

class StubScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return { text: `rendered:${ctx.route.pathOnly}` };
  }
}

class DataScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    const parts = Object.entries(ctx.data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`);
    return { text: parts.join(',') };
  }
}

class SpyRenderer implements Renderer {
  readonly renders: ScreenView[] = [];
  async render(view: ScreenView, _target: RenderTarget): Promise<RenderResult> {
    this.renders.push(view);
    return {};
  }
  async answerCallbackQuery(_target: RenderTarget): Promise<void> {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const testUser: TelegramUser = { id: 1, firstName: 'Test', isBot: false };
const testChat: TelegramChat = { id: 100, type: 'private' };
const testTarget: RenderTarget = { chatId: 100, userId: 1 };

function buildEngine(): { engine: NavigationEngine; renderer: SpyRenderer } {
  const renderer = new SpyRenderer();
  const engine = new NavigationEngine(
    new Router(),
    new ScreenRegistry(),
    renderer,
    new InMemoryStateStore(),
  );
  return { engine, renderer };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Phase 4 — lifecycle integration', () => {
  // ── Execution order ─────────────────────────────────────────────────────────

  describe('execution order', () => {
    it('runs: middleware(before) → guard → resolver → render → middleware(after)', async () => {
      const order: string[] = [];

      class TraceMiddleware extends BaseMiddleware {
        async handle(_ctx: NavigationContext, next: NextFn): Promise<void> {
          order.push('middleware:before');
          await next();
          order.push('middleware:after');
        }
      }

      class TraceGuard extends BaseGuard {
        async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
          order.push('guard');
          return this.allow();
        }
      }

      class TraceResolver extends BaseResolver<string> {
        async resolve(_ctx: NavigationContext): Promise<string> {
          order.push('resolver');
          return 'data';
        }
      }

      class TraceScreen implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> {
          order.push('render');
          return { text: 'ok' };
        }
      }

      const { engine } = buildEngine();
      engine.use(TraceMiddleware);
      engine.register({
        path: '/',
        component: TraceScreen,
        guards: [TraceGuard],
        resolvers: { item: TraceResolver },
      });

      await engine.navigate('/', testUser, testChat, testTarget);

      expect(order).toEqual([
        'middleware:before',
        'guard',
        'resolver',
        'render',
        'middleware:after',
      ]);
    });

    it('runs multiple middleware in onion order (before: A→B, after: B→A)', async () => {
      const order: string[] = [];

      class First extends BaseMiddleware {
        async handle(_ctx: NavigationContext, next: NextFn): Promise<void> {
          order.push('A:before');
          await next();
          order.push('A:after');
        }
      }

      class Second extends BaseMiddleware {
        async handle(_ctx: NavigationContext, next: NextFn): Promise<void> {
          order.push('B:before');
          await next();
          order.push('B:after');
        }
      }

      const { engine } = buildEngine();
      engine.use(First).use(Second);
      engine.register({ path: '/', component: StubScreen });

      await engine.navigate('/', testUser, testChat, testTarget);

      expect(order).toEqual(['A:before', 'B:before', 'B:after', 'A:after']);
    });
  });

  // ── Middleware short-circuit ─────────────────────────────────────────────────

  describe('middleware short-circuit', () => {
    it('blocks navigation when middleware omits next()', async () => {
      class BlockAll extends BaseMiddleware {
        async handle(_ctx: NavigationContext, _next: NextFn): Promise<void> {
          // does not call next()
        }
      }

      const { engine, renderer } = buildEngine();
      engine.use(BlockAll);
      engine.register({ path: '/', component: StubScreen });

      await engine.navigate('/', testUser, testChat, testTarget);

      expect(renderer.renders).toHaveLength(0);
    });

    it('second middleware does not run when first one short-circuits', async () => {
      let secondRan = false;

      class Blocker extends BaseMiddleware {
        async handle(_ctx: NavigationContext, _next: NextFn): Promise<void> {}
      }

      class Second extends BaseMiddleware {
        async handle(_ctx: NavigationContext, next: NextFn): Promise<void> {
          secondRan = true;
          await next();
        }
      }

      const { engine } = buildEngine();
      engine.use(Blocker).use(Second);
      engine.register({ path: '/', component: StubScreen });

      await engine.navigate('/', testUser, testChat, testTarget);

      expect(secondRan).toBe(false);
    });
  });

  // ── Guard behaviour ──────────────────────────────────────────────────────────

  describe('guard chain', () => {
    it('stops on first denial — subsequent guards do not run', async () => {
      const ran: string[] = [];

      class GuardA extends BaseGuard {
        async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
          ran.push('A');
          return this.deny('denied by A');
        }
      }

      class GuardB extends BaseGuard {
        async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
          ran.push('B');
          return this.allow();
        }
      }

      const { engine } = buildEngine();
      engine.register({ path: '/', component: StubScreen, guards: [GuardA, GuardB] });

      await expect(engine.navigate('/', testUser, testChat, testTarget))
        .rejects.toThrow(NavigationGuardError);

      expect(ran).toEqual(['A']);
    });

    it('all guards must pass for navigation to complete', async () => {
      class Always extends BaseGuard {
        async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
          return this.allow();
        }
      }

      const { engine, renderer } = buildEngine();
      engine.register({ path: '/', component: StubScreen, guards: [Always, Always] });

      await engine.navigate('/', testUser, testChat, testTarget);
      expect(renderer.renders).toHaveLength(1);
    });

    it('guard redirect triggers a fresh navigation to the redirect target', async () => {
      class NeverAllow extends BaseGuard {
        async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
          return this.redirect('/login');
        }
      }

      const { engine, renderer } = buildEngine();
      engine.register({ path: '/login', component: StubScreen });
      engine.register({ path: '/dashboard', component: StubScreen, guards: [NeverAllow] });

      await engine.navigate('/dashboard', testUser, testChat, testTarget);

      expect(renderer.renders).toHaveLength(1);
      expect(renderer.renders[0]!.text).toBe('rendered:/login');
    });
  });

  // ── IsAuthenticatedGuard ─────────────────────────────────────────────────────

  describe('IsAuthenticatedGuard + session middleware', () => {
    it('allows access when session middleware populates ctx.data', async () => {
      class SessionMiddleware extends BaseMiddleware {
        async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
          ctx.data['session'] = { userId: 7 };
          await next();
        }
      }

      const { engine, renderer } = buildEngine();
      engine.use(SessionMiddleware);
      engine.register({ path: '/login', component: StubScreen });
      engine.register({
        path: '/dashboard',
        component: StubScreen,
        guards: [IsAuthenticatedGuard],
      });

      await engine.navigate('/dashboard', testUser, testChat, testTarget);
      expect(renderer.renders[0]!.text).toBe('rendered:/dashboard');
    });

    it('redirects to /login when no session in ctx.data', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({ path: '/login', component: StubScreen });
      engine.register({
        path: '/dashboard',
        component: StubScreen,
        guards: [IsAuthenticatedGuard],
      });

      await engine.navigate('/dashboard', testUser, testChat, testTarget);
      expect(renderer.renders[0]!.text).toBe('rendered:/login');
    });
  });

  // ── Middleware → guard data flow ─────────────────────────────────────────────

  describe('middleware → guard data flow', () => {
    it('data written by middleware is visible to guards in the same context', async () => {
      let guardSeenRole: unknown;

      class RoleMiddleware extends BaseMiddleware {
        async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
          ctx.data['role'] = 'admin';
          await next();
        }
      }

      class RoleGuard extends BaseGuard {
        async canActivate(ctx: NavigationContext): Promise<GuardResult> {
          guardSeenRole = ctx.data['role'];
          return this.allow();
        }
      }

      const { engine } = buildEngine();
      engine.use(RoleMiddleware);
      engine.register({ path: '/', component: StubScreen, guards: [RoleGuard] });

      await engine.navigate('/', testUser, testChat, testTarget);
      expect(guardSeenRole).toBe('admin');
    });
  });

  // ── Data priority ────────────────────────────────────────────────────────────

  describe('ctx.data priority: static < middleware < resolver', () => {
    it('resolver data overrides middleware data which overrides static route data', async () => {
      class OverrideMiddleware extends BaseMiddleware {
        async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
          ctx.data['key'] = 'from-middleware';
          ctx.data['mwOnly'] = 'mw';
          await next();
        }
      }

      class OverrideResolver extends BaseResolver<string> {
        async resolve(_ctx: NavigationContext): Promise<string> {
          return 'from-resolver';
        }
      }

      const { engine, renderer } = buildEngine();
      engine.use(OverrideMiddleware);
      engine.register({
        path: '/',
        component: DataScreen,
        data: { key: 'from-static', staticOnly: 'static' },
        resolvers: { key: OverrideResolver },
      });

      await engine.navigate('/', testUser, testChat, testTarget);
      const text = renderer.renders[0]!.text;
      // resolver beats middleware beats static for 'key'
      expect(text).toContain('key=from-resolver');
      // static data lands in ctx.data when not overridden
      expect(text).toContain('staticOnly=static');
      // middleware data lands in ctx.data when not overridden by resolver
      expect(text).toContain('mwOnly=mw');
    });
  });

  // ── Resolvers ────────────────────────────────────────────────────────────────

  describe('resolvers', () => {
    it('multiple resolvers run and all land in ctx.data', async () => {
      class NameResolver extends BaseResolver<string> {
        async resolve(_ctx: NavigationContext): Promise<string> { return 'Alice'; }
      }
      class AgeResolver extends BaseResolver<number> {
        async resolve(_ctx: NavigationContext): Promise<number> { return 30; }
      }

      const { engine, renderer } = buildEngine();
      engine.register({
        path: '/',
        component: DataScreen,
        resolvers: { name: NameResolver, age: AgeResolver },
      });

      await engine.navigate('/', testUser, testChat, testTarget);
      expect(renderer.renders[0]!.text).toContain('name=Alice');
      expect(renderer.renders[0]!.text).toContain('age=30');
    });

    it('throws ResolverError when a resolver rejects', async () => {
      class BrokenResolver extends BaseResolver<never> {
        async resolve(_ctx: NavigationContext): Promise<never> {
          throw new Error('db offline');
        }
      }

      const { engine } = buildEngine();
      engine.register({ path: '/', component: StubScreen, resolvers: { data: BrokenResolver } });

      await expect(engine.navigate('/', testUser, testChat, testTarget))
        .rejects.toThrow(ResolverError);
    });

    it('resolver receives route params', async () => {
      class ParamResolver extends BaseResolver<string> {
        async resolve(ctx: NavigationContext): Promise<string> {
          return `event-${ctx.params['id'] ?? '?'}`;
        }
      }

      const { engine, renderer } = buildEngine();
      engine.register({
        path: '/events/:id',
        component: DataScreen,
        resolvers: { label: ParamResolver },
      });

      await engine.navigate('/events/99', testUser, testChat, testTarget);
      expect(renderer.renders[0]!.text).toContain('label=event-99');
    });
  });

  // ── Combined scenario ────────────────────────────────────────────────────────

  describe('combined: middleware + guard + resolver', () => {
    it('all three cooperate in a single navigation', async () => {
      class AuthMiddleware extends BaseMiddleware {
        async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
          ctx.data['session'] = { userId: 1 };
          await next();
        }
      }

      class ProfileResolver extends BaseResolver<{ name: string }> {
        async resolve(_ctx: NavigationContext): Promise<{ name: string }> {
          return { name: 'Alice' };
        }
      }

      class ProfileScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> {
          const profile = ctx.data['profile'] as { name: string } | undefined;
          return { text: `Hello ${profile?.name ?? 'stranger'}` };
        }
      }

      const { engine, renderer } = buildEngine();
      engine.use(AuthMiddleware);
      engine.register({
        path: '/profile',
        component: ProfileScreen,
        guards: [IsAuthenticatedGuard],
        resolvers: { profile: ProfileResolver },
      });

      await engine.navigate('/profile', testUser, testChat, testTarget);
      expect(renderer.renders[0]!.text).toBe('Hello Alice');
    });
  });
});
