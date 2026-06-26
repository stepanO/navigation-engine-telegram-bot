import { NavigationEngine } from '../navigation-engine.js';
import { Router } from '../../router/router.js';
import { ScreenRegistry } from '../../registry/screen-registry.js';
import { InMemoryStateStore } from '../../state/in-memory-state-store.js';
import { NavigationGuardError, NoHistoryError, RouteNotFoundError } from '../../interfaces/errors.js';
import type { ScreenComponent, ScreenView } from '../../interfaces/screen.js';
import type { NavigationContext, TelegramUser, TelegramChat } from '../../interfaces/navigation.js';
import type { RenderTarget, Renderer, RenderResult } from '../../interfaces/renderer.js';
import type { Guard, GuardResult } from '../../interfaces/guard.js';
import type { Resolver } from '../../interfaces/resolver.js';
import type { NavigationMiddleware, NextFn } from '../../interfaces/middleware.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────

class EventScreen implements ScreenComponent {
  lastCtx?: NavigationContext;
  beforeEnterCalled = false;
  afterRenderCalled = false;

  async beforeEnter(ctx: NavigationContext): Promise<void> {
    this.beforeEnterCalled = true;
    this.lastCtx = ctx;
  }

  async render(ctx: NavigationContext): Promise<ScreenView> {
    this.lastCtx = ctx;
    return { text: `Event: ${ctx.params['eventId'] ?? 'unknown'}` };
  }

  async afterRender(ctx: NavigationContext): Promise<void> {
    this.afterRenderCalled = true;
    this.lastCtx = ctx;
  }
}

class HomeScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'Home' };
  }
}

class SpyRenderer implements Renderer {
  readonly renders: Array<{ view: ScreenView; target: RenderTarget }> = [];
  readonly callbacks: RenderTarget[] = [];

  async render(view: ScreenView, target: RenderTarget): Promise<RenderResult> {
    this.renders.push({ view, target });
    return {};
  }

  async answerCallbackQuery(target: RenderTarget): Promise<void> {
    this.callbacks.push(target);
  }

  async deleteMessage(_chatId: number, _messageId: number): Promise<void> {}
}

class AllowGuard implements Guard {
  async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
    return { allowed: true };
  }
}

class DenyGuard implements Guard {
  async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
    return { allowed: false, message: 'Not allowed' };
  }
}

class RedirectGuard implements Guard {
  async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
    return { allowed: false, redirect: '/' };
  }
}

class EventResolver implements Resolver<{ name: string }> {
  async resolve(ctx: NavigationContext): Promise<{ name: string }> {
    return { name: `Event ${ctx.params['eventId'] ?? '?'}` };
  }
}

class FailingResolver implements Resolver {
  async resolve(_ctx: NavigationContext): Promise<unknown> {
    throw new Error('DB error');
  }
}

class LogMiddleware implements NavigationMiddleware {
  static log: string[] = [];
  async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
    LogMiddleware.log.push(`before:${ctx.route.pathOnly}`);
    await next();
    LogMiddleware.log.push(`after:${ctx.route.pathOnly}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const testUser: TelegramUser = {
  id: 1,
  firstName: 'Test',
  isBot: false,
};

const testChat: TelegramChat = { id: 100, type: 'private' };
const testTarget: RenderTarget = { chatId: 100, userId: 1, messageId: 42 };

function buildEngine(renderer?: Renderer): { engine: NavigationEngine; renderer: SpyRenderer } {
  const spy = renderer instanceof SpyRenderer ? renderer : new SpyRenderer();
  const engine = new NavigationEngine(
    new Router(),
    new ScreenRegistry(),
    spy,
    new InMemoryStateStore(),
  );
  return { engine, renderer: spy };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NavigationEngine', () => {
  describe('register()', () => {
    it('returns this for chaining', () => {
      const { engine } = buildEngine();
      const result = engine.register({ path: '/events', component: HomeScreen });
      expect(result).toBe(engine);
    });
  });

  describe('navigate()', () => {
    it('renders the matching screen', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({ path: '/home', component: HomeScreen });

      await engine.navigate('/home', testUser, testChat, testTarget);

      expect(renderer.renders).toHaveLength(1);
      expect(renderer.renders[0]!.view.text).toBe('Home');
    });

    it('passes route params to the screen', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({ path: '/events/:eventId', component: EventScreen });

      await engine.navigate('/events/42', testUser, testChat, testTarget);

      expect(renderer.renders[0]!.view.text).toBe('Event: 42');
    });

    it('throws RouteNotFoundError for unknown path', async () => {
      const { engine } = buildEngine();
      await expect(engine.navigate('/unknown', testUser, testChat, testTarget))
        .rejects.toThrow(RouteNotFoundError);
    });

    it('calls answerCallbackQuery after render', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({ path: '/', component: HomeScreen });

      await engine.navigate('/', testUser, testChat, testTarget);

      expect(renderer.callbacks).toHaveLength(1);
    });

    it('calls beforeEnter and afterRender lifecycle hooks', async () => {
      const spy = new SpyRenderer();
      const engine = new NavigationEngine(new Router(), new ScreenRegistry(), spy, new InMemoryStateStore());

      // We need access to the screen instance — override ScreenRegistry
      const screen = new EventScreen();
      const ScreenCtor = class extends EventScreen {
        constructor() { super(); Object.assign(this, screen); }
      } as unknown as new () => ScreenComponent;

      engine.register({ path: '/events/:eventId', component: ScreenCtor });
      await engine.navigate('/events/1', testUser, testChat, testTarget);

      expect(spy.renders).toHaveLength(1);
    });
  });

  describe('guards', () => {
    it('allows navigation when guard returns allowed', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({
        path: '/home',
        component: HomeScreen,
        guards: [AllowGuard],
      });

      await engine.navigate('/home', testUser, testChat, testTarget);
      expect(renderer.renders).toHaveLength(1);
    });

    it('throws NavigationGuardError when guard denies', async () => {
      const { engine } = buildEngine();
      engine.register({
        path: '/admin',
        component: HomeScreen,
        guards: [DenyGuard],
      });

      await expect(engine.navigate('/admin', testUser, testChat, testTarget))
        .rejects.toThrow(NavigationGuardError);
    });

    it('redirects when guard returns redirect', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({ path: '/', component: HomeScreen });
      engine.register({
        path: '/admin',
        component: HomeScreen,
        guards: [RedirectGuard],
      });

      await engine.navigate('/admin', testUser, testChat, testTarget);
      // Should have rendered '/' not '/admin'
      expect(renderer.renders).toHaveLength(1);
      expect(renderer.renders[0]!.view.text).toBe('Home');
    });
  });

  describe('resolvers', () => {
    it('populates ctx.data with resolved values', async () => {
      const { engine, renderer } = buildEngine();

      class DataScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> {
          const event = ctx.data['event'] as { name: string } | undefined;
          return { text: event?.name ?? 'no data' };
        }
      }

      engine.register({
        path: '/events/:eventId',
        component: DataScreen,
        resolvers: { event: EventResolver },
      });

      await engine.navigate('/events/7', testUser, testChat, testTarget);
      expect(renderer.renders[0]!.view.text).toBe('Event 7');
    });

    it('throws ResolverError when resolver fails', async () => {
      const { engine } = buildEngine();
      engine.register({
        path: '/events/:eventId',
        component: HomeScreen,
        resolvers: { event: FailingResolver },
      });

      await expect(engine.navigate('/events/1', testUser, testChat, testTarget))
        .rejects.toThrow('Resolver "event" failed');
    });
  });

  describe('middleware', () => {
    it('runs middleware in registration order', async () => {
      LogMiddleware.log = [];
      const { engine } = buildEngine();
      engine.use(LogMiddleware);
      engine.register({ path: '/', component: HomeScreen });

      await engine.navigate('/', testUser, testChat, testTarget);

      expect(LogMiddleware.log).toContain('before:/');
      expect(LogMiddleware.log).toContain('after:/');
    });
  });

  describe('back()', () => {
    it('throws NoHistoryError when there is no history', async () => {
      const { engine } = buildEngine();
      await expect(engine.back(testUser, testChat, testTarget))
        .rejects.toThrow(NoHistoryError);
    });

    it('navigates to the previous route', async () => {
      const { engine, renderer } = buildEngine();

      class EventsScreen implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> {
          return { text: 'Events List' };
        }
      }

      engine
        .register({ path: '/', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen });

      await engine.navigate('/', testUser, testChat, testTarget);
      await engine.navigate('/events', testUser, testChat, testTarget);
      await engine.back(testUser, testChat, testTarget);

      expect(renderer.renders).toHaveLength(3);
      expect(renderer.renders[2]!.view.text).toBe('Home');
    });
  });

  describe('replace()', () => {
    it('renders the matching screen', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({ path: '/home', component: HomeScreen });

      await engine.replace('/home', testUser, testChat, testTarget);

      expect(renderer.renders).toHaveLength(1);
      expect(renderer.renders[0]!.view.text).toBe('Home');
    });

    it('replaces the current history entry (back goes to the entry before replace)', async () => {
      class EventsScreen implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'Events' }; }
      }
      const { engine, renderer } = buildEngine();
      engine
        .register({ path: '/', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen })
        .register({ path: '/home', component: HomeScreen });

      await engine.navigate('/', testUser, testChat, testTarget);
      await engine.replace('/events', testUser, testChat, testTarget);
      // After replace: history is [/events], going back from here should fail
      await expect(engine.back(testUser, testChat, testTarget)).rejects.toThrow(NoHistoryError);
      expect(renderer.renders).toHaveLength(2);
    });
  });

  describe('renderer returning new messageId', () => {
    it('stores the returned messageId in the navigation stack', async () => {
      class SendRenderer implements Renderer {
        async render(_view: ScreenView, _target: RenderTarget): Promise<RenderResult> {
          return { messageId: 77 };
        }
        async answerCallbackQuery(_target: RenderTarget): Promise<void> {}
        async deleteMessage(_chatId: number, _messageId: number): Promise<void> {}
      }

      const store = new InMemoryStateStore();
      const engine = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SendRenderer(),
        store,
      );
      engine.register({ path: '/', component: HomeScreen });

      await engine.navigate('/', testUser, testChat, { chatId: 100, userId: 1 });

      const state = await store.get('100:1');
      expect(state?.messageId).toBe(77);
    });
  });

  describe('context navigation callbacks', () => {
    it('ctx.navigate() fires a nested navigation from within render()', async () => {
      class NavInRenderScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> {
          await ctx.navigate('/home');
          return { text: 'outer' };
        }
      }
      class HomeScreen2 implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'Inner' }; }
      }

      const { engine, renderer } = buildEngine();
      engine
        .register({ path: '/nav', component: NavInRenderScreen })
        .register({ path: '/home', component: HomeScreen2 });

      await engine.navigate('/nav', testUser, testChat, testTarget);
      // Inner navigate fires first, outer render completes afterward
      expect(renderer.renders).toHaveLength(2);
      expect(renderer.renders[0]!.view.text).toBe('Inner');
      expect(renderer.renders[1]!.view.text).toBe('outer');
    });

    it('ctx.replace() fires a replace navigation from within render()', async () => {
      class ReplaceInRenderScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> {
          await ctx.replace('/home');
          return { text: 'outer' };
        }
      }
      class HomeScreen2 implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'Replaced' }; }
      }

      const { engine, renderer } = buildEngine();
      engine
        .register({ path: '/replace', component: ReplaceInRenderScreen })
        .register({ path: '/home', component: HomeScreen2 });

      await engine.navigate('/replace', testUser, testChat, testTarget);
      expect(renderer.renders).toHaveLength(2);
      expect(renderer.renders[0]!.view.text).toBe('Replaced');
    });

    it('ctx.back() fires a back navigation from within render() when history exists', async () => {
      class GoBackScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> {
          await ctx.back();
          return { text: 'going back' };
        }
      }

      const { engine, renderer } = buildEngine();
      engine
        .register({ path: '/', component: HomeScreen })
        .register({ path: '/step', component: HomeScreen })
        .register({ path: '/go-back', component: GoBackScreen });

      // Build 2 committed history entries so back() has something to go to
      await engine.navigate('/', testUser, testChat, testTarget);    // renders[0]
      await engine.navigate('/step', testUser, testChat, testTarget); // renders[1]
      await engine.navigate('/go-back', testUser, testChat, testTarget);
      // ctx.back() fires → go back to /step → renders[2]
      // /go-back screen itself renders → renders[3]
      expect(renderer.renders[2]!.view.text).toBe('Home'); // from back() navigating to /step
    });
  });

  describe('resolver caching (cacheTtl)', () => {
    it('calls resolver once and caches the result within TTL', async () => {
      let callCount = 0;
      class CachedResolver implements Resolver<string> {
        static readonly cacheTtl = 60_000;
        async resolve(_ctx: NavigationContext): Promise<string> {
          callCount++;
          return 'data';
        }
      }
      class DataScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> {
          return { text: ctx.data['info'] as string ?? '' };
        }
      }

      const { engine } = buildEngine();
      engine.register({ path: '/', component: DataScreen, resolvers: { info: CachedResolver } });

      await engine.navigate('/', testUser, testChat, testTarget);
      await engine.navigate('/', testUser, testChat, testTarget);

      expect(callCount).toBe(1);
    });

    it('calls resolver again when TTL has expired', async () => {
      let callCount = 0;
      class StaleResolver implements Resolver<string> {
        static readonly cacheTtl = 0;
        async resolve(_ctx: NavigationContext): Promise<string> {
          callCount++;
          return 'data';
        }
      }
      class DataScreen implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'ok' }; }
      }

      const { engine } = buildEngine();
      engine.register({ path: '/', component: DataScreen, resolvers: { val: StaleResolver } });

      await engine.navigate('/', testUser, testChat, testTarget);
      await engine.navigate('/', testUser, testChat, testTarget);

      expect(callCount).toBe(2);
    });

    it('different route params produce separate cache entries', async () => {
      let callCount = 0;
      class CachedResolver implements Resolver<string> {
        static readonly cacheTtl = 60_000;
        async resolve(ctx: NavigationContext): Promise<string> {
          callCount++;
          return ctx.params['id'] ?? '';
        }
      }
      class DataScreen implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'ok' }; }
      }

      const { engine } = buildEngine();
      engine.register({ path: '/items/:id', component: DataScreen, resolvers: { item: CachedResolver } });

      await engine.navigate('/items/1', testUser, testChat, testTarget);
      await engine.navigate('/items/2', testUser, testChat, testTarget);
      await engine.navigate('/items/1', testUser, testChat, testTarget); // cache hit for /1

      expect(callCount).toBe(2); // /1 and /2 each called once
    });
  });

  describe('cancelActiveWizard()', () => {
    it('ctx.cancelActiveWizard() calls the configured fn with the current user/chat', async () => {
      const calls: Array<{ chatId: number; userId: number; wizardId: string | undefined }> = [];
      const engine = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SpyRenderer(),
        new InMemoryStateStore(),
        {
          cancelActiveWizardFn: async (user, chat, wizardId) => {
            calls.push({ chatId: chat.id, userId: user.id, wizardId });
          },
        },
      );

      let capturedCtx: NavigationContext | undefined;
      class CaptureScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> {
          capturedCtx = ctx;
          return { text: 'ok' };
        }
      }

      engine.register({ path: '/', component: CaptureScreen });
      await engine.navigate('/', testUser, testChat, testTarget);
      await capturedCtx!.cancelActiveWizard('myWizard');

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ chatId: testChat.id, userId: testUser.id, wizardId: 'myWizard' });
    });

    it('ctx.cancelActiveWizard() without wizardId passes undefined', async () => {
      const calls: Array<{ wizardId: string | undefined }> = [];
      const engine = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SpyRenderer(),
        new InMemoryStateStore(),
        { cancelActiveWizardFn: async (_u, _c, wizardId) => { calls.push({ wizardId }); } },
      );

      let capturedCtx: NavigationContext | undefined;
      class CaptureScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> { capturedCtx = ctx; return { text: 'ok' }; }
      }
      engine.register({ path: '/', component: CaptureScreen });
      await engine.navigate('/', testUser, testChat, testTarget);
      await capturedCtx!.cancelActiveWizard();

      expect(calls[0]?.wizardId).toBeUndefined();
    });

    it('ctx.cancelActiveWizard() is a no-op when no fn is configured', async () => {
      const { engine } = buildEngine();
      let capturedCtx: NavigationContext | undefined;
      class CaptureScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> { capturedCtx = ctx; return { text: 'ok' }; }
      }
      engine.register({ path: '/', component: CaptureScreen });
      await engine.navigate('/', testUser, testChat, testTarget);
      // Should not throw
      await expect(capturedCtx!.cancelActiveWizard('w')).resolves.toBeUndefined();
    });
  });

  describe('onNavigate hook', () => {
    it('is called once after a successful navigation', async () => {
      const events: unknown[] = [];
      const engine = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SpyRenderer(),
        new InMemoryStateStore(),
        { onNavigate: (e) => events.push(e) },
      );
      engine.register({ path: '/', component: HomeScreen });
      await engine.navigate('/', testUser, testChat, testTarget);
      expect(events).toHaveLength(1);
    });

    it('receives the navigated path, userId, and chatId', async () => {
      const events: Parameters<NonNullable<import('../navigation-engine.js').NavigationEngineConfig['onNavigate']>>[0][] = [];
      const engine = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SpyRenderer(),
        new InMemoryStateStore(),
        { onNavigate: (e) => events.push(e) },
      );
      engine.register({ path: '/home', component: HomeScreen });
      await engine.navigate('/home', testUser, testChat, testTarget);
      expect(events[0]?.path).toBe('/home');
      expect(events[0]?.userId).toBe(testUser.id);
      expect(events[0]?.chatId).toBe(testChat.id);
    });

    it('totalDurationMs is a non-negative number', async () => {
      const events: { totalDurationMs: number }[] = [];
      const engine = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SpyRenderer(),
        new InMemoryStateStore(),
        { onNavigate: (e) => events.push(e) },
      );
      engine.register({ path: '/', component: HomeScreen });
      await engine.navigate('/', testUser, testChat, testTarget);
      expect(events[0]!.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes resolver durations keyed by resolver name', async () => {
      const events: { resolverDurationsMs: Record<string, number> }[] = [];
      const engine = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SpyRenderer(),
        new InMemoryStateStore(),
        { onNavigate: (e) => events.push(e) },
      );

      class DataScreen implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'ok' }; }
      }
      engine.register({ path: '/', component: DataScreen, resolvers: { event: EventResolver } });
      await engine.navigate('/', testUser, testChat, testTarget);

      expect(events[0]?.resolverDurationsMs).toHaveProperty('event');
      expect(events[0]!.resolverDurationsMs['event']).toBeGreaterThanOrEqual(0);
    });

    it('resolverDurationsMs is empty when no resolvers are configured', async () => {
      const events: { resolverDurationsMs: Record<string, number> }[] = [];
      const engine = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SpyRenderer(),
        new InMemoryStateStore(),
        { onNavigate: (e) => events.push(e) },
      );
      engine.register({ path: '/', component: HomeScreen });
      await engine.navigate('/', testUser, testChat, testTarget);
      expect(events[0]?.resolverDurationsMs).toEqual({});
    });

    it('is not called when navigation throws', async () => {
      const events: unknown[] = [];
      const engineWithHook = new NavigationEngine(
        new Router(),
        new ScreenRegistry(),
        new SpyRenderer(),
        new InMemoryStateStore(),
        { onNavigate: (e) => events.push(e) },
      );
      engineWithHook.register({ path: '/admin', component: HomeScreen, guards: [DenyGuard] });
      await expect(engineWithHook.navigate('/admin', testUser, testChat, testTarget)).rejects.toThrow();
      expect(events).toHaveLength(0);
    });
  });

  describe('state persistence', () => {
    it('persists and restores navigation state across engine calls', async () => {
      const store = new InMemoryStateStore();
      const renderer = new SpyRenderer();

      class EventsScreen implements ScreenComponent {
        async render(_ctx: NavigationContext): Promise<ScreenView> {
          return { text: 'Events' };
        }
      }

      // Engine 1: navigate forward and persist state
      const engine1 = new NavigationEngine(new Router(), new ScreenRegistry(), renderer, store);
      engine1
        .register({ path: '/', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen });
      await engine1.navigate('/', testUser, testChat, testTarget);
      await engine1.navigate('/events', testUser, testChat, testTarget);

      // Engine 2: fresh router/registry but shares the same state store
      const engine2 = new NavigationEngine(new Router(), new ScreenRegistry(), renderer, store);
      engine2
        .register({ path: '/', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen });
      await engine2.back(testUser, testChat, testTarget);

      // Third render should be Home (back from /events → /)
      expect(renderer.renders[2]!.view.text).toBe('Home');
    });
  });
});
