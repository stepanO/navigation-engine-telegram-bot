import { RouteMatcher } from '../route-matcher.js';
import { compileRoute } from '../route-parser.js';
import type { RouteDefinition } from '../../interfaces/route.js';
import type { ScreenComponent, ScreenView } from '../../interfaces/screen.js';
import type { NavigationContext } from '../../interfaces/navigation.js';

class StubScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'stub' };
  }
}

function addRoute(matcher: RouteMatcher, path: string): void {
  const definition: RouteDefinition = { path, component: StubScreen };
  matcher.add(compileRoute(definition));
}

describe('RouteMatcher', () => {
  let matcher: RouteMatcher;

  beforeEach(() => {
    matcher = new RouteMatcher();
  });

  describe('match()', () => {
    it('returns undefined for an empty registry', () => {
      expect(matcher.match('/events')).toBeUndefined();
    });

    it('matches a static path', () => {
      addRoute(matcher, '/events');
      const result = matcher.match('/events');
      expect(result).toBeDefined();
      expect(result!.definition.path).toBe('/events');
    });

    it('returns undefined for unknown path', () => {
      addRoute(matcher, '/events');
      expect(matcher.match('/organizations')).toBeUndefined();
    });

    it('extracts path params', () => {
      addRoute(matcher, '/events/:eventId');
      const result = matcher.match('/events/42');
      expect(result?.params).toEqual({ eventId: '42' });
    });

    it('extracts query params', () => {
      addRoute(matcher, '/events');
      const result = matcher.match('/events?page=2&sort=name');
      expect(result?.query).toEqual({ page: '2', sort: 'name' });
    });

    it('extracts both path and query params', () => {
      addRoute(matcher, '/events/:eventId/participants');
      const result = matcher.match('/events/42/participants?page=3');
      expect(result?.params).toEqual({ eventId: '42' });
      expect(result?.query).toEqual({ page: '3' });
    });

    it('preserves the original fullPath', () => {
      addRoute(matcher, '/events/:eventId');
      const result = matcher.match('/events/42?tab=payments');
      expect(result?.fullPath).toBe('/events/42?tab=payments');
      expect(result?.pathOnly).toBe('/events/42');
    });

    it('matches first registered route when multiple could match', () => {
      addRoute(matcher, '/events/:id');
      addRoute(matcher, '/events/special');
      // Because /events/:id is registered first, it wins
      const result = matcher.match('/events/special');
      expect(result?.definition.path).toBe('/events/:id');
    });

    it('matches specific route registered before wildcard', () => {
      addRoute(matcher, '/events/special');
      addRoute(matcher, '/events/:id');
      const result = matcher.match('/events/special');
      expect(result?.definition.path).toBe('/events/special');
    });
  });

  describe('has()', () => {
    it('returns true for a matching path', () => {
      addRoute(matcher, '/events');
      expect(matcher.has('/events')).toBe(true);
    });

    it('returns false for a non-matching path', () => {
      addRoute(matcher, '/events');
      expect(matcher.has('/organizations')).toBe(false);
    });
  });

  describe('getRoutes()', () => {
    it('returns all registered compiled routes', () => {
      addRoute(matcher, '/events');
      addRoute(matcher, '/organizations');
      expect(matcher.getRoutes()).toHaveLength(2);
    });
  });
});
