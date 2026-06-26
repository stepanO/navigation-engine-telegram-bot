import { compileRoute, extractParams, splitPathAndQuery } from '../route-parser.js';
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

describe('compileRoute', () => {
  it('compiles a static path', () => {
    const compiled = compileRoute(makeRoute('/events'));
    expect(compiled.paramNames).toEqual([]);
    expect(compiled.pattern.test('/events')).toBe(true);
    expect(compiled.pattern.test('/organizations')).toBe(false);
  });

  it('compiles a path with one param', () => {
    const compiled = compileRoute(makeRoute('/events/:eventId'));
    expect(compiled.paramNames).toEqual(['eventId']);
    expect(compiled.pattern.test('/events/42')).toBe(true);
    expect(compiled.pattern.test('/events/abc-123')).toBe(true);
    expect(compiled.pattern.test('/events/')).toBe(false);
    expect(compiled.pattern.test('/events')).toBe(false);
  });

  it('compiles a path with multiple params', () => {
    const compiled = compileRoute(makeRoute('/orgs/:orgId/events/:eventId'));
    expect(compiled.paramNames).toEqual(['orgId', 'eventId']);
    expect(compiled.pattern.test('/orgs/10/events/99')).toBe(true);
    expect(compiled.pattern.test('/orgs/10/events')).toBe(false);
  });

  it('compiles a wildcard path', () => {
    const compiled = compileRoute(makeRoute('/files/*'));
    expect(compiled.pattern.test('/files/a/b/c')).toBe(true);
    expect(compiled.pattern.test('/files/')).toBe(false);
  });

  it('handles root path', () => {
    const compiled = compileRoute(makeRoute('/'));
    expect(compiled.pattern.test('/')).toBe(true);
    expect(compiled.pattern.test('/events')).toBe(false);
  });

  it('allows trailing slash', () => {
    const compiled = compileRoute(makeRoute('/events'));
    expect(compiled.pattern.test('/events/')).toBe(true);
  });

  it('throws for empty path', () => {
    expect(() => compileRoute(makeRoute(''))).toThrow(TypeError);
  });

  it('throws for path not starting with /', () => {
    expect(() => compileRoute(makeRoute('events'))).toThrow(TypeError);
  });

  it('preserves original path', () => {
    const route = makeRoute('/events/:eventId');
    const compiled = compileRoute(route);
    expect(compiled.definition.path).toBe('/events/:eventId');
  });
});

describe('extractParams', () => {
  it('extracts params from a match', () => {
    const compiled = compileRoute(makeRoute('/events/:eventId'));
    const match = compiled.pattern.exec('/events/42')!;
    const params = extractParams(match, compiled.paramNames);
    expect(params).toEqual({ eventId: '42' });
  });

  it('extracts multiple params', () => {
    const compiled = compileRoute(makeRoute('/orgs/:orgId/events/:eventId'));
    const match = compiled.pattern.exec('/orgs/10/events/99')!;
    const params = extractParams(match, compiled.paramNames);
    expect(params).toEqual({ orgId: '10', eventId: '99' });
  });

  it('returns empty object for no params', () => {
    const compiled = compileRoute(makeRoute('/events'));
    const match = compiled.pattern.exec('/events')!;
    const params = extractParams(match, compiled.paramNames);
    expect(params).toEqual({});
  });
});

describe('splitPathAndQuery', () => {
  it('splits path and query', () => {
    const [path, query] = splitPathAndQuery('/events/42?page=2&sort=name');
    expect(path).toBe('/events/42');
    expect(query).toEqual({ page: '2', sort: 'name' });
  });

  it('returns empty query for path without query string', () => {
    const [path, query] = splitPathAndQuery('/events/42');
    expect(path).toBe('/events/42');
    expect(query).toEqual({});
  });

  it('handles empty query string', () => {
    const [path, query] = splitPathAndQuery('/events?');
    expect(path).toBe('/events');
    expect(query).toEqual({});
  });

  it('handles encoded query values', () => {
    const [, query] = splitPathAndQuery('/events?name=Hello%20World');
    expect(query).toEqual({ name: 'Hello World' });
  });

  it('last value wins for duplicate keys', () => {
    const [, query] = splitPathAndQuery('/events?page=1&page=2');
    expect(query['page']).toBe('2');
  });
});
