import { Router } from '../router.js';
import { DuplicateRouteError, RouteNotFoundError } from '../../interfaces/errors.js';
import type { RouteDefinition } from '../../interfaces/route.js';
import type { ScreenComponent, ScreenView } from '../../interfaces/screen.js';
import type { NavigationContext } from '../../interfaces/navigation.js';

class StubScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'stub' };
  }
}

function makeRoute(path: string): RouteDefinition {
  return { path, component: StubScreen };
}

describe('Router', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  describe('register()', () => {
    it('registers a route and returns this for chaining', () => {
      const result = router.register(makeRoute('/events'));
      expect(result).toBe(router);
      expect(router.size).toBe(1);
    });

    it('throws DuplicateRouteError for duplicate paths', () => {
      router.register(makeRoute('/events'));
      expect(() => router.register(makeRoute('/events'))).toThrow(DuplicateRouteError);
    });

    it('allows registering multiple distinct paths', () => {
      router.register(makeRoute('/events'));
      router.register(makeRoute('/organizations'));
      expect(router.size).toBe(2);
    });
  });

  describe('match()', () => {
    it('returns undefined for unknown path', () => {
      router.register(makeRoute('/events'));
      expect(router.match('/unknown')).toBeUndefined();
    });

    it('returns RouteMatch for known path', () => {
      router.register(makeRoute('/events/:eventId'));
      const result = router.match('/events/42');
      expect(result).toBeDefined();
      expect(result!.params).toEqual({ eventId: '42' });
    });
  });

  describe('matchOrThrow()', () => {
    it('returns RouteMatch for known path', () => {
      router.register(makeRoute('/events/:eventId'));
      const result = router.matchOrThrow('/events/42');
      expect(result.params).toEqual({ eventId: '42' });
    });

    it('throws RouteNotFoundError for unknown path', () => {
      expect(() => router.matchOrThrow('/unknown')).toThrow(RouteNotFoundError);
    });
  });

  describe('has()', () => {
    it('returns true for matching paths', () => {
      router.register(makeRoute('/events/:eventId'));
      expect(router.has('/events/42')).toBe(true);
    });

    it('returns false for non-matching paths', () => {
      router.register(makeRoute('/events'));
      expect(router.has('/organizations')).toBe(false);
    });
  });

  describe('chaining', () => {
    it('supports fluent registration', () => {
      router
        .register(makeRoute('/'))
        .register(makeRoute('/events'))
        .register(makeRoute('/events/:eventId'));
      expect(router.size).toBe(3);
    });
  });
});
