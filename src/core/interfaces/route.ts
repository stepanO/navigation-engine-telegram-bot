/**
 * Core route-related types.
 *
 * `RouteDefinition` is the developer-facing registration object.
 * `CompiledRoute` is the internal representation after parsing path patterns.
 * `RouteMatch` is produced by the router when a path is successfully matched.
 */

import type { GuardConstructor } from './guard.js';
import type { ResolverMap } from './resolver.js';
import type { ScreenComponentConstructor } from './screen.js';

/**
 * Lazy component factory — called on the first navigation to this route.
 * The returned constructor is cached; subsequent navigations reuse it.
 * Must be an arrow function (not a class or regular function) so the
 * registry can distinguish it from a constructor at runtime.
 *
 * @example
 * { path: '/admin', component: () => AdminScreen }
 */
export type LazyComponentFactory = () => ScreenComponentConstructor;

/** Params extracted from path segments, e.g. /events/:eventId → { eventId: "42" } */
export type RouteParams = Readonly<Record<string, string>>;

/** Params extracted from query string, e.g. ?page=2 → { page: "2" } */
export type QueryParams = Readonly<Record<string, string>>;

/** Arbitrary static data attached to a route, merged into NavigationContext.data */
export type RouteStaticData = Readonly<Record<string, unknown>>;

/**
 * Developer-facing route configuration registered with NavigationEngine.register().
 *
 * @example
 * engine.register({
 *   path: '/events/:eventId',
 *   component: EventScreen,
 *   guards: [IsAuthenticatedGuard],
 *   resolvers: { event: EventResolver },
 * });
 */
export interface RouteDefinition {
  /** Path pattern. Supports named segments (:param) and wildcards (*). */
  readonly path: string;
  /**
   * Screen component class, or a lazy factory arrow function that returns one.
   * Lazy factories are called on the first navigation to this route; the
   * resolved constructor is then cached for subsequent navigations.
   */
  readonly component: ScreenComponentConstructor | LazyComponentFactory;
  /** Guards evaluated in order before rendering. Any rejection stops navigation. */
  readonly guards?: readonly GuardConstructor[];
  /** Resolvers run in parallel after guards pass. Results land in ctx.data. */
  readonly resolvers?: ResolverMap;
  /** Static data merged into ctx.data (lowest priority, overridden by resolvers). */
  readonly data?: RouteStaticData;
}

/**
 * Internal representation of a route after the path pattern is compiled to a RegExp.
 * Created once at registration time.
 */
export interface CompiledRoute {
  readonly definition: RouteDefinition;
  /** Regex compiled from the path pattern. */
  readonly pattern: RegExp;
  /** Ordered list of parameter names found in the pattern. */
  readonly paramNames: readonly string[];
}

/**
 * Result of a successful router match.
 * Carries the definition plus extracted params/query for the matched path.
 */
export interface RouteMatch {
  readonly definition: RouteDefinition;
  readonly params: RouteParams;
  readonly query: QueryParams;
  /** The full path including query string as provided to navigate(). */
  readonly fullPath: string;
  /** Path portion only, without query string. */
  readonly pathOnly: string;
}
