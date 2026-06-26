/**
 * Load test — 1000 concurrent navigations through InMemoryStateStore.
 *
 * Verifies that the engine is concurrency-safe under async load:
 * - 1000 independent users navigating simultaneously
 * - Each user navigates to 2 routes and goes back
 * - Final state per user is consistent with expected history
 */

import { NavigationEngine } from '../core/engine/navigation-engine.js';
import { Router } from '../core/router/router.js';
import { ScreenRegistry } from '../core/registry/screen-registry.js';
import { InMemoryStateStore } from '../core/state/in-memory-state-store.js';
import type { ScreenComponent, ScreenView } from '../core/interfaces/screen.js';
import type { NavigationContext, TelegramUser, TelegramChat } from '../core/interfaces/navigation.js';
import type { RenderTarget, Renderer, RenderResult } from '../core/interfaces/renderer.js';

// ─── Minimal doubles ──────────────────────────────────────────────────────────

class NullRenderer implements Renderer {
  async render(_view: ScreenView, _target: RenderTarget): Promise<RenderResult> {
    return {};
  }
  async answerCallbackQuery(_target: RenderTarget): Promise<void> {}
}

class HomeScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'Home' }; }
}

class EventsScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return { text: `Events for ${ctx.params['userId'] ?? '?'}` };
  }
}

// ─── Load test ────────────────────────────────────────────────────────────────

describe('Load test — 1000 concurrent navigations', () => {
  it('handles 1000 independent user sessions concurrently without errors', async () => {
    const store = new InMemoryStateStore();
    const engine = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      new NullRenderer(),
      store,
    );
    engine
      .register({ path: '/', component: HomeScreen })
      .register({ path: '/events/:userId', component: EventsScreen });

    const USERS = 1000;

    const tasks = Array.from({ length: USERS }, (_, i) => {
      const user: TelegramUser = { id: i + 1, firstName: `User${i + 1}`, isBot: false };
      const chat: TelegramChat = { id: i + 1, type: 'private' };
      const target: RenderTarget = { chatId: i + 1, userId: i + 1 };

      return (async () => {
        await engine.navigate('/', user, chat, target);
        await engine.navigate(`/events/${i + 1}`, user, chat, target);
        await engine.back(user, chat, target);
      })();
    });

    await expect(Promise.all(tasks)).resolves.not.toThrow();

    // Each user should have their own independent state
    expect(store.size).toBe(USERS);
  }, 30_000);

  it('maintains correct per-user history under concurrent load', async () => {
    const store = new InMemoryStateStore();
    const engine = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      new NullRenderer(),
      store,
    );
    engine
      .register({ path: '/', component: HomeScreen })
      .register({ path: '/a', component: HomeScreen })
      .register({ path: '/b', component: HomeScreen });

    const USERS = 200;

    await Promise.all(
      Array.from({ length: USERS }, async (_, i) => {
        const user: TelegramUser = { id: i + 1, firstName: `U${i + 1}`, isBot: false };
        const chat: TelegramChat = { id: i + 1, type: 'private' };
        const target: RenderTarget = { chatId: i + 1, userId: i + 1 };

        await engine.navigate('/', user, chat, target);
        await engine.navigate('/a', user, chat, target);
        await engine.navigate('/b', user, chat, target);
      }),
    );

    // Verify a sample of users have 3-entry histories
    for (let i = 0; i < Math.min(10, USERS); i++) {
      const state = await store.get(`${i + 1}:${i + 1}`);
      expect(state?.entries).toHaveLength(3);
      expect(state?.entries[2]!.path).toBe('/b');
    }
  }, 30_000);
});
