/**
 * Integration tests: DI-aware instantiation through NavigationEngine.
 * Verifies that screens, guards, resolvers, and middleware can all receive
 * injected services via their static factory() methods.
 */

import type { NavigationContext } from '../../interfaces/navigation.js';
import type { ScreenView } from '../../interfaces/screen.js';
import type { GuardResult } from '../../interfaces/guard.js';
import type { RenderTarget, RenderResult } from '../../interfaces/renderer.js';
import type { Renderer } from '../../interfaces/renderer.js';
import { NavigationEngine } from '../../engine/navigation-engine.js';
import { Router } from '../../router/router.js';
import { ScreenRegistry, createInjectable } from '../../registry/screen-registry.js';
import { InMemoryStateStore } from '../../state/in-memory-state-store.js';
import { InjectionToken } from '../injection-token.js';
import { SimpleInjector } from '../simple-injector.js';
import { BaseGuard } from '../../guards/base-guard.js';
import { BaseResolver } from '../../resolvers/base-resolver.js';
import { BaseMiddleware } from '../../middleware/base-middleware.js';
import type { NextFn } from '../../interfaces/middleware.js';
import type { Injector } from '../injector.js';

// ─── Service types ─────────────────────────────────────────────────────────────

interface GreetingService {
  greet(name: string): string;
}

interface AccessService {
  isAllowed(): boolean;
}

interface DataService {
  load(): string;
}

const GREETING_SVC = new InjectionToken<GreetingService>('GreetingService');
const ACCESS_SVC = new InjectionToken<AccessService>('AccessService');
const DATA_SVC = new InjectionToken<DataService>('DataService');

// ─── Spy renderer ─────────────────────────────────────────────────────────────

class SpyRenderer implements Renderer {
  readonly views: ScreenView[] = [];
  async render(view: ScreenView): Promise<RenderResult> {
    this.views.push(view);
    return {};
  }
  async answerCallbackQuery(): Promise<void> {}
  async deleteMessage(_chatId: number, _messageId: number): Promise<void> {}
  get lastView(): ScreenView | undefined {
    return this.views[this.views.length - 1];
  }
}

// ─── DI-aware screen ─────────────────────────────────────────────────────────
// Constructor param is optional so the class still satisfies `new () => ScreenComponent`.
// The static factory() is the correct path when DI is configured.

class GreetingScreen {
  static factory(injector: Injector): GreetingScreen {
    return new GreetingScreen(injector.get(GREETING_SVC));
  }

  constructor(private readonly greetingSvc?: GreetingService) {}

  async render(ctx: NavigationContext): Promise<ScreenView> {
    return { text: this.greetingSvc!.greet(ctx.user.firstName) };
  }
}

// ─── No-arg screen (backward compat) ──────────────────────────────────────────

class SimpleScreen {
  async render(): Promise<ScreenView> {
    return { text: 'simple' };
  }
}

// ─── DI-aware guard ───────────────────────────────────────────────────────────

class AccessGuard extends BaseGuard {
  static factory(injector: Injector): AccessGuard {
    return new AccessGuard(injector.get(ACCESS_SVC));
  }

  constructor(private readonly accessSvc?: AccessService) {
    super();
  }

  async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
    return this.accessSvc!.isAllowed() ? this.allow() : this.deny('not allowed');
  }
}

// ─── DI-aware resolver ────────────────────────────────────────────────────────

class DataResolver extends BaseResolver<string> {
  static factory(injector: Injector): DataResolver {
    return new DataResolver(injector.get(DATA_SVC));
  }

  constructor(private readonly dataSvc?: DataService) {
    super();
  }

  async resolve(_ctx: NavigationContext): Promise<string> {
    return this.dataSvc!.load();
  }
}

// ─── DI-aware middleware ──────────────────────────────────────────────────────

const middlewareLog: string[] = [];

class LoggingMiddleware extends BaseMiddleware {
  static factory(injector: Injector): LoggingMiddleware {
    return new LoggingMiddleware(injector.get(GREETING_SVC));
  }

  constructor(private readonly greetingSvc?: GreetingService) {
    super();
  }

  async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
    middlewareLog.push(this.greetingSvc!.greet(ctx.user.firstName));
    await next();
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const user = { id: 1, firstName: 'Alice', isBot: false } as const;
const chat = { id: 100, type: 'private' as const };
const target: RenderTarget = { chatId: 100, userId: 1 };

function makeEngine(injector?: SimpleInjector, renderer?: SpyRenderer): [NavigationEngine, SpyRenderer] {
  const spy = renderer ?? new SpyRenderer();
  const engine = new NavigationEngine(
    new Router(),
    new ScreenRegistry(),
    spy,
    new InMemoryStateStore(),
    injector !== undefined ? { injector } : {},
  );
  return [engine, spy];
}

// ─── Tests: screen injection ──────────────────────────────────────────────────

describe('DI — screen with factory()', () => {
  it('receives injected service and uses it during render', async () => {
    const injector = new SimpleInjector().bind(GREETING_SVC, {
      greet: (name: string) => `Hello, ${name}!`,
    });
    const [engine, spy] = makeEngine(injector);
    engine.register({ path: '/', component: GreetingScreen });
    await engine.navigate('/', user, chat, target);
    expect(spy.lastView?.text).toBe('Hello, Alice!');
  });

  it('no-arg screen still works when injector is present (backward compat)', async () => {
    const injector = new SimpleInjector().bind(GREETING_SVC, { greet: () => 'x' });
    const [engine, spy] = makeEngine(injector);
    engine.register({ path: '/simple', component: SimpleScreen });
    await engine.navigate('/simple', user, chat, target);
    expect(spy.lastView?.text).toBe('simple');
  });

  it('no-arg screen works when no injector is configured', async () => {
    const [engine, spy] = makeEngine();
    engine.register({ path: '/simple', component: SimpleScreen });
    await engine.navigate('/simple', user, chat, target);
    expect(spy.lastView?.text).toBe('simple');
  });
});

// ─── Tests: guard injection ───────────────────────────────────────────────────

describe('DI — guard with factory()', () => {
  it('guard receives injected service — allows when service says allowed', async () => {
    const injector = new SimpleInjector()
      .bind(ACCESS_SVC, { isAllowed: () => true })
      .bind(GREETING_SVC, { greet: () => '' });
    const [engine, spy] = makeEngine(injector);
    engine.register({
      path: '/',
      component: SimpleScreen,
      guards: [AccessGuard],
    });
    await engine.navigate('/', user, chat, target);
    expect(spy.views).toHaveLength(1);
  });

  it('guard receives injected service — denies when service says not allowed', async () => {
    const injector = new SimpleInjector()
      .bind(ACCESS_SVC, { isAllowed: () => false })
      .bind(GREETING_SVC, { greet: () => '' });
    const [engine] = makeEngine(injector);
    engine.register({ path: '/', component: SimpleScreen, guards: [AccessGuard] });
    await expect(engine.navigate('/', user, chat, target)).rejects.toThrow('not allowed');
  });
});

// ─── Tests: resolver injection ────────────────────────────────────────────────

describe('DI — resolver with factory()', () => {
  it('resolver receives injected service and data lands in ctx.data', async () => {
    let capturedData: Record<string, unknown> | undefined;

    class DataScreen {
      async render(ctx: NavigationContext): Promise<ScreenView> {
        capturedData = ctx.data;
        return { text: ctx.data['payload'] as string };
      }
    }

    const injector = new SimpleInjector().bind(DATA_SVC, { load: () => 'loaded!' });
    const [engine, spy] = makeEngine(injector);
    engine.register({ path: '/', component: DataScreen, resolvers: { payload: DataResolver } });
    await engine.navigate('/', user, chat, target);
    expect(spy.lastView?.text).toBe('loaded!');
    expect(capturedData?.['payload']).toBe('loaded!');
  });
});

// ─── Tests: middleware injection ──────────────────────────────────────────────

describe('DI — middleware with factory()', () => {
  beforeEach(() => {
    middlewareLog.length = 0;
  });

  it('middleware receives injected service and runs before render', async () => {
    const injector = new SimpleInjector().bind(GREETING_SVC, {
      greet: (name: string) => `Hi ${name}`,
    });
    const [engine] = makeEngine(injector);
    engine.register({ path: '/', component: SimpleScreen });
    engine.use(LoggingMiddleware);
    await engine.navigate('/', user, chat, target);
    expect(middlewareLog).toEqual(['Hi Alice']);
  });
});

// ─── Tests: createInjectable helper ──────────────────────────────────────────

describe('createInjectable()', () => {
  it('calls factory when injector is provided and factory exists', () => {
    const injector = new SimpleInjector().bind(GREETING_SVC, { greet: () => 'x' });
    const instance = createInjectable(GreetingScreen, injector);
    expect(instance).toBeInstanceOf(GreetingScreen);
  });

  it('calls new Ctor() when no injector is provided', () => {
    const instance = createInjectable(SimpleScreen, undefined);
    expect(instance).toBeInstanceOf(SimpleScreen);
  });

  it('calls new Ctor() when injector is provided but factory is absent', () => {
    const injector = new SimpleInjector();
    const instance = createInjectable(SimpleScreen, injector);
    expect(instance).toBeInstanceOf(SimpleScreen);
  });
});

// ─── Tests: ScreenRegistry with injector ────────────────────────────────────

describe('ScreenRegistry.createScreen() with injector', () => {
  it('uses factory when injector is provided', () => {
    const injector = new SimpleInjector().bind(GREETING_SVC, { greet: () => 'y' });
    const registry = new ScreenRegistry();
    registry.register({ path: '/', component: GreetingScreen });
    const screen = registry.createScreen('/', injector);
    expect(screen).toBeInstanceOf(GreetingScreen);
  });

  it('falls back to new Ctor() when no injector is provided', () => {
    const registry = new ScreenRegistry();
    registry.register({ path: '/simple', component: SimpleScreen });
    const screen = registry.createScreen('/simple');
    expect(screen).toBeInstanceOf(SimpleScreen);
  });
});
