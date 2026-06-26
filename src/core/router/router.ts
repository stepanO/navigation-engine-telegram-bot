/**
 * Router — public API for route registration and path matching.
 *
 * Wraps RouteMatcher and compileRoute. The NavigationEngine delegates
 * to Router; screens and guards never reference Router directly.
 */

import type { RouteDefinition, RouteMatch } from '../interfaces/route.js';
import { DuplicateRouteError, RouteNotFoundError } from '../interfaces/errors.js';
import { compileRoute } from './route-parser.js';
import { RouteMatcher } from './route-matcher.js';

export class Router {
  private readonly matcher = new RouteMatcher();
  private readonly registeredPaths = new Set<string>();

  /**
   * Register a route definition. Throws if the exact path pattern was already registered.
   *
   * @example
   * router.register({ path: '/events/:eventId', component: EventScreen });
   */
  register(definition: RouteDefinition): this {
    if (this.registeredPaths.has(definition.path)) {
      throw new DuplicateRouteError(definition.path);
    }

    const compiled = compileRoute(definition);
    this.matcher.add(compiled);
    this.registeredPaths.add(definition.path);

    return this;
  }

  /**
   * Match a path against registered routes.
   * Returns the RouteMatch or undefined if no route matched.
   */
  match(path: string): RouteMatch | undefined {
    return this.matcher.match(path);
  }

  /**
   * Like match() but throws RouteNotFoundError when no route matches.
   * Use this inside NavigationEngine where a miss is always an error.
   */
  matchOrThrow(path: string): RouteMatch {
    const result = this.match(path);
    if (!result) {
      throw new RouteNotFoundError(path);
    }
    return result;
  }

  /** Returns true if any registered route matches the given path. */
  has(path: string): boolean {
    return this.matcher.has(path);
  }

  /** Number of registered routes. */
  get size(): number {
    return this.registeredPaths.size;
  }
}
