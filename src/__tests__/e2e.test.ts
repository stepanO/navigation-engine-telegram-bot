/**
 * E2E integration test — full navigation lifecycle without grammY.
 *
 * Uses NavigationEngine directly with real Router, ScreenRegistry,
 * InMemoryStateStore and a SpyRenderer. Simulates a realistic B2B SaaS
 * scenario: login flow, list navigation, detail screen, guard redirect,
 * wizard entry, and action dispatch.
 */

import { NavigationEngine } from '../core/engine/navigation-engine.js';
import { Router } from '../core/router/router.js';
import { ScreenRegistry } from '../core/registry/screen-registry.js';
import { InMemoryStateStore } from '../core/state/in-memory-state-store.js';
import { NavigationGuardError, NoHistoryError } from '../core/interfaces/errors.js';
import type { ScreenComponent, ScreenView } from '../core/interfaces/screen.js';
import type { NavigationContext, TelegramUser, TelegramChat } from '../core/interfaces/navigation.js';
import type { RenderTarget, Renderer, RenderResult } from '../core/interfaces/renderer.js';
import type { Guard, GuardResult } from '../core/interfaces/guard.js';
import type { Resolver } from '../core/interfaces/resolver.js';
import type { NavigationMiddleware, NextFn } from '../core/interfaces/middleware.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────

class SpyRenderer implements Renderer {
  readonly renders: Array<{ view: ScreenView; target: RenderTarget }> = [];
  async render(view: ScreenView, target: RenderTarget): Promise<RenderResult> {
    this.renders.push({ view, target });
    return {};
  }
  async answerCallbackQuery(_target: RenderTarget): Promise<void> {}
  async deleteMessage(_chatId: number, _messageId: number): Promise<void> {}
}

class HomeScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    const user = ctx.data['user'] as string | undefined;
    return { text: `Home — ${user ?? 'guest'}` };
  }
}

class EventsScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'Events list' };
  }
}

class EventDetailScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    const event = ctx.data['event'] as { name: string } | undefined;
    return { text: `Event: ${event?.name ?? ctx.params['id'] ?? '?'}` };
  }
}

class LoginScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'Please log in' };
  }
}

class SessionMiddleware implements NavigationMiddleware {
  async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
    (ctx.data as Record<string, unknown>)['user'] = 'Alice';
    await next();
  }
}

class AuthGuard implements Guard {
  async canActivate(ctx: NavigationContext): Promise<GuardResult> {
    if (ctx.data['user']) {
      return { allowed: true };
    }
    return { allowed: false, redirect: '/login' };
  }
}

class EventResolver implements Resolver<{ name: string }> {
  async resolve(ctx: NavigationContext): Promise<{ name: string }> {
    return { name: `Event #${ctx.params['id'] ?? '?'}` };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const user: TelegramUser = { id: 1, firstName: 'Alice', isBot: false };
const chat: TelegramChat = { id: 100, type: 'private' };
const target: RenderTarget = { chatId: 100, userId: 1, messageId: 10 };

function buildEngine() {
  const renderer = new SpyRenderer();
  const store = new InMemoryStateStore();
  const engine = new NavigationEngine(
    new Router(),
    new ScreenRegistry(),
    renderer,
    store,
  );
  return { engine, renderer, store };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('E2E — full navigation lifecycle', () => {
  describe('basic navigation flow', () => {
    it('navigates forward through multiple screens', async () => {
      const { engine, renderer } = buildEngine();
      engine
        .register({ path: '/home', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen });

      await engine.navigate('/home', user, chat, target);
      await engine.navigate('/events', user, chat, target);

      expect(renderer.renders).toHaveLength(2);
      expect(renderer.renders[0]!.view.text).toBe('Home — guest');
      expect(renderer.renders[1]!.view.text).toBe('Events list');
    });

    it('navigates back through history', async () => {
      const { engine, renderer } = buildEngine();
      engine
        .register({ path: '/home', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen });

      await engine.navigate('/home', user, chat, target);
      await engine.navigate('/events', user, chat, target);
      await engine.back(user, chat, target);

      expect(renderer.renders[2]!.view.text).toBe('Home — guest');
    });

    it('throws NoHistoryError when backing from first screen', async () => {
      const { engine } = buildEngine();
      engine.register({ path: '/home', component: HomeScreen });
      await engine.navigate('/home', user, chat, target);
      await expect(engine.back(user, chat, target)).rejects.toThrow(NoHistoryError);
    });

    it('replace() substitutes the current history entry', async () => {
      const { engine, renderer } = buildEngine();
      engine
        .register({ path: '/home', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen });

      await engine.navigate('/home', user, chat, target);
      await engine.replace('/events', user, chat, target);

      // After replace, back should fail (no previous entry to go to)
      await expect(engine.back(user, chat, target)).rejects.toThrow(NoHistoryError);
      expect(renderer.renders[1]!.view.text).toBe('Events list');
    });
  });

  describe('middleware + guard + resolver pipeline', () => {
    it('middleware populates data before guards run', async () => {
      const { engine, renderer } = buildEngine();
      engine
        .use(SessionMiddleware)
        .register({ path: '/home', component: HomeScreen });

      await engine.navigate('/home', user, chat, target);

      expect(renderer.renders[0]!.view.text).toBe('Home — Alice');
    });

    it('guard blocks access and redirects unauthenticated users', async () => {
      const { engine, renderer } = buildEngine();
      engine
        .register({ path: '/login', component: LoginScreen })
        .register({ path: '/home', component: HomeScreen, guards: [AuthGuard] });

      await engine.navigate('/home', user, chat, target);

      // Should have rendered /login (redirect) not /home
      expect(renderer.renders[0]!.view.text).toBe('Please log in');
    });

    it('guard allows access when middleware populates session', async () => {
      const { engine, renderer } = buildEngine();
      engine
        .use(SessionMiddleware)
        .register({ path: '/home', component: HomeScreen, guards: [AuthGuard] });

      await engine.navigate('/home', user, chat, target);
      expect(renderer.renders[0]!.view.text).toBe('Home — Alice');
    });

    it('guard throws NavigationGuardError when configured to deny without redirect', async () => {
      class HardDenyGuard implements Guard {
        async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
          return { allowed: false, message: 'Forbidden' };
        }
      }
      const { engine } = buildEngine();
      engine.register({ path: '/admin', component: HomeScreen, guards: [HardDenyGuard] });
      await expect(engine.navigate('/admin', user, chat, target))
        .rejects.toThrow(NavigationGuardError);
    });

    it('resolver populates ctx.data with fetched values', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({
        path: '/events/:id',
        component: EventDetailScreen,
        resolvers: { event: EventResolver },
      });

      await engine.navigate('/events/42', user, chat, target);
      expect(renderer.renders[0]!.view.text).toBe('Event: Event #42');
    });
  });

  describe('state persistence across engine instances', () => {
    it('restores history state and allows back() across engine restarts', async () => {
      const store = new InMemoryStateStore();
      const renderer = new SpyRenderer();

      const engine1 = new NavigationEngine(new Router(), new ScreenRegistry(), renderer, store);
      engine1
        .register({ path: '/home', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen });
      await engine1.navigate('/home', user, chat, target);
      await engine1.navigate('/events', user, chat, target);

      // Simulate restart: new engine instances sharing the same store
      const engine2 = new NavigationEngine(new Router(), new ScreenRegistry(), renderer, store);
      engine2
        .register({ path: '/home', component: HomeScreen })
        .register({ path: '/events', component: EventsScreen });
      await engine2.back(user, chat, target);

      expect(renderer.renders[2]!.view.text).toBe('Home — guest');
    });
  });

  describe('route params and query strings', () => {
    it('passes :params to the screen', async () => {
      const { engine, renderer } = buildEngine();
      engine.register({ path: '/events/:id', component: EventDetailScreen });
      await engine.navigate('/events/99', user, chat, target);
      expect(renderer.renders[0]!.view.text).toBe('Event: 99');
    });

    it('passes ?query params to the resolver', async () => {
      class QueryScreen implements ScreenComponent {
        async render(ctx: NavigationContext): Promise<ScreenView> {
          return { text: `page=${ctx.query['page'] ?? '?'}` };
        }
      }
      const { engine, renderer } = buildEngine();
      engine.register({ path: '/events', component: QueryScreen });
      await engine.navigate('/events?page=3', user, chat, target);
      expect(renderer.renders[0]!.view.text).toBe('page=3');
    });
  });
});
