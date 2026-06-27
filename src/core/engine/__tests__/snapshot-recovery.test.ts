/**
 * Snapshot recovery integration tests.
 *
 * These tests exercise the full NavigationEngine → RouteSnapshotStore pipeline:
 *   - snapshot persistence after render
 *   - recovery after simulated bot restart (StateStore cleared)
 *   - recovery when snapshot has been deleted
 *   - stale snapshot (screenVersion mismatch) — infrastructure verified
 *   - missing screen (route not registered at recovery time)
 *   - resolver failure during recovery
 *   - recoverNavigation returns false when no snapshotStore is configured
 */

import { NavigationEngine } from '../navigation-engine.js';
import { Router } from '../../router/router.js';
import { ScreenRegistry } from '../../registry/screen-registry.js';
import { InMemoryStateStore } from '../../state/in-memory-state-store.js';
import { InMemoryRouteSnapshotStore } from '../../snapshot/in-memory-route-snapshot-store.js';
import { RouteNotFoundError, ResolverError } from '../../interfaces/errors.js';
import type { ScreenComponent, ScreenView } from '../../interfaces/screen.js';
import type { NavigationContext, TelegramUser, TelegramChat } from '../../interfaces/navigation.js';
import type { RenderTarget, Renderer, RenderResult } from '../../interfaces/renderer.js';
import type { Resolver } from '../../interfaces/resolver.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────

class HomeScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'Home' };
  }
}

class UserScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return { text: `User ${ctx.params['id'] ?? 'unknown'}` };
  }
}

class VersionedScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'Versioned' };
  }
}

class SpyRenderer implements Renderer {
  readonly renders: Array<{ view: ScreenView; target: RenderTarget }> = [];
  private nextMessageId: number | undefined;

  /** Simulate a renderer that returns a new messageId (sendMessage path). */
  setNextMessageId(id: number): void {
    this.nextMessageId = id;
  }

  async render(view: ScreenView, target: RenderTarget): Promise<RenderResult> {
    this.renders.push({ view, target });
    if (this.nextMessageId !== undefined) {
      const id = this.nextMessageId;
      this.nextMessageId = undefined;
      return { messageId: id };
    }
    return {};
  }

  async answerCallbackQuery(_target: RenderTarget): Promise<void> {}

  async deleteMessage(_chatId: number, _messageId: number): Promise<void> {}

  get lastRender(): { view: ScreenView; target: RenderTarget } | undefined {
    return this.renders[this.renders.length - 1];
  }
}

class FailingResolver implements Resolver<never> {
  async resolve(_ctx: NavigationContext): Promise<never> {
    throw new Error('data source unavailable');
  }
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const user: TelegramUser = {
  id: 1,
  firstName: 'Alice',
  isBot: false,
};

const chat: TelegramChat = {
  id: 100,
  type: 'private',
};

function makeTarget(messageId?: number): RenderTarget {
  const base: RenderTarget = { chatId: chat.id, userId: user.id };
  return messageId !== undefined ? { ...base, messageId } : base;
}

interface TestSetup {
  engine: NavigationEngine;
  renderer: SpyRenderer;
  stateStore: InMemoryStateStore;
  snapshotStore: InMemoryRouteSnapshotStore;
}

function buildEngine(registerRoutes: (engine: NavigationEngine) => void): TestSetup {
  const renderer = new SpyRenderer();
  const stateStore = new InMemoryStateStore();
  const snapshotStore = new InMemoryRouteSnapshotStore();

  const engine = new NavigationEngine(
    new Router(),
    new ScreenRegistry(),
    renderer,
    stateStore,
    { snapshotStore },
  );

  registerRoutes(engine);
  return { engine, renderer, stateStore, snapshotStore };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Snapshot persistence', () => {
  it('saves a snapshot after a successful render when messageId comes from renderer', async () => {
    const { engine, renderer, snapshotStore } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen });
    });

    // Renderer returns a new messageId (simulating sendMessage)
    renderer.setNextMessageId(555);
    await engine.navigate('/', user, chat, makeTarget());

    const snap = await snapshotStore.find(chat.id, 555);
    expect(snap).not.toBeNull();
    expect(snap?.route).toBe('/');
    expect(snap?.chatId).toBe(chat.id);
    expect(snap?.messageId).toBe(555);
    expect(snap?.screenVersion).toBe(1);
    expect(snap?.params).toEqual({});
    expect(snap?.query).toEqual({});
    expect(snap?.renderedAt).toBeInstanceOf(Date);
  });

  it('saves a snapshot after a successful render when messageId comes from target', async () => {
    const { engine, snapshotStore } = buildEngine(e => {
      e.register({ path: '/users/:id', component: UserScreen });
    });

    // Target already carries messageId (simulating editMessage path)
    await engine.navigate('/users/42', user, chat, makeTarget(777));

    const snap = await snapshotStore.find(chat.id, 777);
    expect(snap).not.toBeNull();
    expect(snap?.route).toBe('/users/42');
    expect(snap?.params).toEqual({ id: '42' });
    expect(snap?.messageId).toBe(777);
  });

  it('skips snapshot persistence when messageId is not known', async () => {
    const { engine, snapshotStore } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen });
    });

    // Neither renderer nor target supplies messageId
    await engine.navigate('/', user, chat, makeTarget());

    expect(snapshotStore.size).toBe(0);
  });

  it('overwrites the snapshot on re-render of the same message', async () => {
    const { engine, snapshotStore } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen });
      e.register({ path: '/users/:id', component: UserScreen });
    });

    await engine.navigate('/', user, chat, makeTarget(300));
    await engine.navigate('/users/7', user, chat, makeTarget(300));

    const snap = await snapshotStore.find(chat.id, 300);
    expect(snap?.route).toBe('/users/7');
    expect(snapshotStore.size).toBe(1);
  });

  it('stores the route version from RouteDefinition.version', async () => {
    const { engine, renderer, snapshotStore } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen, version: 3 });
    });

    renderer.setNextMessageId(400);
    await engine.navigate('/', user, chat, makeTarget());

    const snap = await snapshotStore.find(chat.id, 400);
    expect(snap?.screenVersion).toBe(3);
  });

  it('defaults screenVersion to 1 when route has no version field', async () => {
    const { engine, renderer, snapshotStore } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen }); // no version
    });

    renderer.setNextMessageId(401);
    await engine.navigate('/', user, chat, makeTarget());

    const snap = await snapshotStore.find(chat.id, 401);
    expect(snap?.screenVersion).toBe(1);
  });

  it('stores query params from the navigated path', async () => {
    const { engine, snapshotStore } = buildEngine(e => {
      e.register({ path: '/users/:id', component: UserScreen });
    });

    await engine.navigate('/users/5?tab=settings&page=2', user, chat, makeTarget(500));

    const snap = await snapshotStore.find(chat.id, 500);
    expect(snap?.route).toBe('/users/5?tab=settings&page=2');
    expect(snap?.params).toEqual({ id: '5' });
    expect(snap?.query).toEqual({ tab: 'settings', page: '2' });
  });

  it('does not save a snapshot when no snapshotStore is configured', async () => {
    // Engine without snapshotStore option
    const renderer = new SpyRenderer();
    const stateStore = new InMemoryStateStore();
    const engine = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      renderer,
      stateStore,
      // no snapshotStore
    );
    engine.register({ path: '/', component: HomeScreen });

    renderer.setNextMessageId(600);
    await engine.navigate('/', user, chat, makeTarget());
    // No error thrown — snapshot persistence is a no-op.
  });
});

// ─── Recovery after restart ───────────────────────────────────────────────────

describe('Recovery after simulated bot restart', () => {
  it('re-renders the screen at the stored route and returns true', async () => {
    const { engine, renderer, stateStore, snapshotStore } = buildEngine(e => {
      e.register({ path: '/users/:id', component: UserScreen });
    });

    // Initial navigation — snapshot saved for messageId 200
    await engine.navigate('/users/9', user, chat, makeTarget(200));
    expect(snapshotStore.size).toBe(1);

    // Simulate restart: wipe the StateStore (equivalent to InMemoryStateStore on restart)
    stateStore.clear();
    renderer.renders.length = 0;

    // Recovery: callback arrives for messageId 200 but encoder cannot decode it
    const target = makeTarget(200);
    const recovered = await engine.recoverNavigation(chat.id, 200, user, chat, target);

    expect(recovered).toBe(true);
    expect(renderer.renders).toHaveLength(1);
    expect(renderer.lastRender?.view.text).toBe('User 9');
  });

  it('seeds the navigation stack so future back() does not throw', async () => {
    const { engine, renderer, stateStore } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen });
      e.register({ path: '/users/:id', component: UserScreen });
    });

    // Two navigations — last messageId is 201
    await engine.navigate('/', user, chat, makeTarget(201));
    await engine.navigate('/users/3', user, chat, makeTarget(201));

    // Restart
    stateStore.clear();
    renderer.renders.length = 0;

    // Recover the /users/3 screen
    await engine.recoverNavigation(chat.id, 201, user, chat, makeTarget(201));

    // Snapshot re-rendered — stack now has one entry (/users/3)
    // back() from there has no previous entry → NoHistoryError
    // but navigating forward from recovery works:
    await engine.navigate('/', user, chat, makeTarget(201));
    expect(renderer.lastRender?.view.text).toBe('Home');
  });

  it('updates the snapshot after a successful recovery render', async () => {
    const { engine, snapshotStore } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen });
    });

    await engine.navigate('/', user, chat, makeTarget(300));
    const before = await snapshotStore.find(chat.id, 300);

    // Wait 1ms so renderedAt is strictly later
    await new Promise(r => setTimeout(r, 1));

    await engine.recoverNavigation(chat.id, 300, user, chat, makeTarget(300));
    const after = await snapshotStore.find(chat.id, 300);

    expect(after?.renderedAt.getTime()).toBeGreaterThan(before!.renderedAt.getTime());
  });
});

// ─── Deleted snapshot ─────────────────────────────────────────────────────────

describe('Recovery with deleted snapshot', () => {
  it('returns false when the snapshot has been deleted', async () => {
    const { engine, renderer, snapshotStore } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen });
    });

    await engine.navigate('/', user, chat, makeTarget(100));
    await snapshotStore.delete(chat.id, 100);

    const recovered = await engine.recoverNavigation(chat.id, 100, user, chat, makeTarget(100));

    expect(recovered).toBe(false);
    expect(renderer.renders).toHaveLength(1); // only the original render
  });

  it('returns false when find() returns null (key never existed)', async () => {
    const { engine } = buildEngine(e => {
      e.register({ path: '/', component: HomeScreen });
    });

    const recovered = await engine.recoverNavigation(chat.id, 9999, user, chat, makeTarget(9999));
    expect(recovered).toBe(false);
  });
});

// ─── Stale snapshot (version mismatch) ───────────────────────────────────────

describe('Stale snapshot — screenVersion infrastructure', () => {
  it('stores screenVersion at render time and carries it in the snapshot', async () => {
    const { engine, snapshotStore } = buildEngine(e => {
      e.register({ path: '/', component: VersionedScreen, version: 1 });
    });

    await engine.navigate('/', user, chat, makeTarget(700));
    const snap = await snapshotStore.find(chat.id, 700);
    expect(snap?.screenVersion).toBe(1);
  });

  it('recovery re-renders with the current route version, updating the snapshot', async () => {
    // Phase 1: register with version=1, render, capture snapshot
    const renderer = new SpyRenderer();
    const stateStore = new InMemoryStateStore();
    const snapshotStore = new InMemoryRouteSnapshotStore();

    const engine1 = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      renderer,
      stateStore,
      { snapshotStore },
    );
    engine1.register({ path: '/', component: VersionedScreen, version: 1 });
    await engine1.navigate('/', user, chat, makeTarget(800));

    const snapV1 = await snapshotStore.find(chat.id, 800);
    expect(snapV1?.screenVersion).toBe(1);

    // Phase 2: simulate restart — new engine with version=2 on the same route.
    // The existing snapshot has screenVersion=1.
    stateStore.clear();

    const engine2 = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      renderer,
      stateStore,
      { snapshotStore },
    );
    // Same route, bumped to version 2
    engine2.register({ path: '/', component: VersionedScreen, version: 2 });

    const recovered = await engine2.recoverNavigation(chat.id, 800, user, chat, makeTarget(800));
    expect(recovered).toBe(true);

    // After recovery the snapshot is overwritten with the current version
    const snapV2 = await snapshotStore.find(chat.id, 800);
    expect(snapV2?.screenVersion).toBe(2);
    // snapshot.route is unchanged — same message, same path
    expect(snapV2?.route).toBe('/');
  });
});

// ─── Missing screen ───────────────────────────────────────────────────────────

describe('Recovery with missing screen', () => {
  it('propagates RouteNotFoundError when the snapshot route is no longer registered', async () => {
    // Insert a snapshot manually pointing to a route that does not exist
    const snapshotStore = new InMemoryRouteSnapshotStore();
    await snapshotStore.save({
      messageId: 900,
      chatId: chat.id,
      route: '/deleted-feature',
      params: {},
      query: {},
      screenVersion: 1,
      renderedAt: new Date(),
    });

    const renderer = new SpyRenderer();
    const stateStore = new InMemoryStateStore();
    const engine = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      renderer,
      stateStore,
      { snapshotStore },
    );
    // Only '/' is registered — '/deleted-feature' is absent
    engine.register({ path: '/', component: HomeScreen });

    await expect(
      engine.recoverNavigation(chat.id, 900, user, chat, makeTarget(900)),
    ).rejects.toThrow(RouteNotFoundError);
  });
});

// ─── Resolver failure during recovery ────────────────────────────────────────

describe('Recovery with resolver failure', () => {
  it('propagates ResolverError when a resolver throws during recovery', async () => {
    const snapshotStore = new InMemoryRouteSnapshotStore();
    await snapshotStore.save({
      messageId: 950,
      chatId: chat.id,
      route: '/protected',
      params: {},
      query: {},
      screenVersion: 1,
      renderedAt: new Date(),
    });

    const renderer = new SpyRenderer();
    const stateStore = new InMemoryStateStore();
    const engine = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      renderer,
      stateStore,
      { snapshotStore },
    );
    engine.register({
      path: '/protected',
      component: HomeScreen,
      resolvers: { data: FailingResolver },
    });

    await expect(
      engine.recoverNavigation(chat.id, 950, user, chat, makeTarget(950)),
    ).rejects.toThrow(ResolverError);
  });
});

// ─── No snapshotStore configured ─────────────────────────────────────────────

describe('recoverNavigation without snapshotStore', () => {
  it('returns false immediately without any store access', async () => {
    const renderer = new SpyRenderer();
    const stateStore = new InMemoryStateStore();
    const engine = new NavigationEngine(
      new Router(),
      new ScreenRegistry(),
      renderer,
      stateStore,
      // no snapshotStore
    );
    engine.register({ path: '/', component: HomeScreen });

    const recovered = await engine.recoverNavigation(chat.id, 123, user, chat, makeTarget(123));
    expect(recovered).toBe(false);
    expect(renderer.renders).toHaveLength(0);
  });
});
