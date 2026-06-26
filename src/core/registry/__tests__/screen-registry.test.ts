import { ScreenRegistry, createInjectable } from '../screen-registry.js';
import { RouteNotFoundError } from '../../interfaces/errors.js';
import type { ScreenComponent, ScreenView } from '../../interfaces/screen.js';
import type { NavigationContext } from '../../interfaces/navigation.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

class HomeScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'Home' };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScreenRegistry', () => {
  let registry: ScreenRegistry;

  beforeEach(() => {
    registry = new ScreenRegistry();
  });

  describe('register() / has() / size', () => {
    it('registers a screen and reports it via has()', () => {
      registry.register({ path: '/home', component: HomeScreen });
      expect(registry.has('/home')).toBe(true);
    });

    it('has() returns false for unregistered paths', () => {
      expect(registry.has('/unknown')).toBe(false);
    });

    it('size reflects the number of registered screens', () => {
      expect(registry.size).toBe(0);
      registry.register({ path: '/a', component: HomeScreen });
      expect(registry.size).toBe(1);
      registry.register({ path: '/b', component: HomeScreen });
      expect(registry.size).toBe(2);
    });
  });

  describe('getConstructor()', () => {
    it('returns the registered constructor for an eager component', () => {
      registry.register({ path: '/home', component: HomeScreen });
      expect(registry.getConstructor('/home')).toBe(HomeScreen);
    });

    it('throws RouteNotFoundError for unknown paths', () => {
      expect(() => registry.getConstructor('/unknown')).toThrow(RouteNotFoundError);
    });

    it('resolves a lazy factory on first access', () => {
      const factory = () => HomeScreen;
      registry.register({ path: '/lazy', component: factory });
      expect(registry.getConstructor('/lazy')).toBe(HomeScreen);
    });

    it('caches the lazy factory result — factory called only once', () => {
      let factoryCalls = 0;
      const factory = () => { factoryCalls++; return HomeScreen; };
      registry.register({ path: '/lazy', component: factory });

      registry.getConstructor('/lazy');
      registry.getConstructor('/lazy');

      expect(factoryCalls).toBe(1);
    });
  });

  describe('createScreen() — eager component', () => {
    it('instantiates a new screen each time', () => {
      registry.register({ path: '/home', component: HomeScreen });
      const s1 = registry.createScreen('/home');
      const s2 = registry.createScreen('/home');
      expect(s1).toBeInstanceOf(HomeScreen);
      expect(s2).toBeInstanceOf(HomeScreen);
      expect(s1).not.toBe(s2);
    });
  });

  describe('createScreen() — lazy component', () => {
    it('instantiates the screen returned by the factory', () => {
      registry.register({ path: '/home', component: () => HomeScreen });
      const screen = registry.createScreen('/home');
      expect(screen).toBeInstanceOf(HomeScreen);
    });

    it('creates a fresh instance on each call (lazy factory, no singleton)', () => {
      registry.register({ path: '/home', component: () => HomeScreen });
      const s1 = registry.createScreen('/home');
      const s2 = registry.createScreen('/home');
      expect(s1).not.toBe(s2);
    });
  });

  describe('createScreen() — singleton', () => {
    it('returns the same instance on repeated calls when singleton = true', () => {
      class SingletonScreen implements ScreenComponent {
        static readonly singleton = true as const;
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'singleton' }; }
      }

      registry.register({ path: '/home', component: SingletonScreen });
      const s1 = registry.createScreen('/home');
      const s2 = registry.createScreen('/home');
      expect(s1).toBe(s2);
      expect(s1).toBeInstanceOf(SingletonScreen);
    });

    it('different paths have independent singleton instances', () => {
      class SingletonA implements ScreenComponent {
        static readonly singleton = true as const;
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'A' }; }
      }
      class SingletonB implements ScreenComponent {
        static readonly singleton = true as const;
        async render(_ctx: NavigationContext): Promise<ScreenView> { return { text: 'B' }; }
      }

      registry.register({ path: '/a', component: SingletonA });
      registry.register({ path: '/b', component: SingletonB });

      const a = registry.createScreen('/a');
      const b = registry.createScreen('/b');
      expect(a).toBeInstanceOf(SingletonA);
      expect(b).toBeInstanceOf(SingletonB);
      expect(a).not.toBe(b);
    });

    it('non-singleton screens are not cached between calls', () => {
      registry.register({ path: '/home', component: HomeScreen });
      const s1 = registry.createScreen('/home');
      const s2 = registry.createScreen('/home');
      expect(s1).not.toBe(s2);
    });
  });

  describe('createInjectable()', () => {
    it('calls new Ctor() when no injector and no factory', () => {
      const instance = createInjectable(HomeScreen, undefined);
      expect(instance).toBeInstanceOf(HomeScreen);
    });
  });
});
