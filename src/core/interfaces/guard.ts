/**
 * Guard interfaces — Angular CanActivate analogue.
 *
 * Guards are evaluated in the order they appear in RouteDefinition.guards[].
 * The first rejection or redirect short-circuits the remaining guards.
 */

import type { NavigationContext } from './navigation.js';
import type { Injector } from '../di/injector.js';

/** Guard returns one of three outcomes. */
export type GuardResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly redirect: string }
  | { readonly allowed: false; readonly redirect?: undefined; readonly message?: string };

/**
 * A guard decides whether navigation to a route is permitted.
 *
 * @example
 * class IsAuthenticatedGuard implements Guard {
 *   async canActivate(ctx: NavigationContext): Promise<GuardResult> {
 *     const session = ctx.data.session as Session | undefined;
 *     if (session?.userId) return { allowed: true };
 *     return { allowed: false, redirect: '/login' };
 *   }
 * }
 */
export interface Guard {
  canActivate(ctx: NavigationContext): Promise<GuardResult>;
}

/**
 * Constructor type for guard classes.
 * Optionally declare a static `factory(injector)` for DI-aware instantiation.
 */
export type GuardConstructor =
  (new () => Guard) &
  { factory?: (injector: Injector) => Guard };
