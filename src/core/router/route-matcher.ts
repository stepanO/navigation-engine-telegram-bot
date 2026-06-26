/**
 * RouteMatcher — finds the best matching CompiledRoute for a given path.
 *
 * Matching strategy:
 *   1. Test routes in registration order.
 *   2. Return the first match (no scoring/specificity yet — register specific
 *      routes before catch-all routes, same as Express).
 *
 * Trade-off vs. specificity-based matching (Angular Router):
 *   - Simpler, predictable, no ambiguity surprises.
 *   - Angular-style scoring adds complexity with marginal benefit at < 500 routes.
 *   - Can be upgraded in a later phase without breaking the public API.
 */

import type { CompiledRoute, RouteMatch } from '../interfaces/route.js';
import { extractParams, splitPathAndQuery } from './route-parser.js';

export class RouteMatcher {
  private readonly routes: CompiledRoute[] = [];

  add(route: CompiledRoute): void {
    this.routes.push(route);
  }

  /**
   * Match a full path (may include query string) against registered routes.
   * Returns undefined if no route matches.
   */
  match(fullPath: string): RouteMatch | undefined {
    const [pathOnly, query] = splitPathAndQuery(fullPath);

    for (const compiled of this.routes) {
      const match = compiled.pattern.exec(pathOnly);
      if (match !== null) {
        return {
          definition: compiled.definition,
          params: extractParams(match, compiled.paramNames),
          query,
          fullPath,
          pathOnly,
        };
      }
    }

    return undefined;
  }

  /** Returns all currently registered CompiledRoutes (for debugging/testing). */
  getRoutes(): readonly CompiledRoute[] {
    return this.routes;
  }

  /** Checks if a path (without query string) matches any registered route. */
  has(path: string): boolean {
    return this.match(path) !== undefined;
  }
}
