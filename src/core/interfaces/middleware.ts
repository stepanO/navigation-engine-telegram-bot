/**
 * Navigation middleware — runs before guards on every navigation event.
 *
 * Middleware forms a chain. Each handler must call next() to continue,
 * or omit it to short-circuit (e.g., block navigation, handle error).
 *
 * @example
 * class AuthMiddleware implements NavigationMiddleware {
 *   async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
 *     // populate ctx data before guards run
 *     await next();
 *   }
 * }
 */

import type { NavigationContext } from './navigation.js';
import type { Injector } from '../di/injector.js';

/** Continues to the next middleware or to guard evaluation. */
export type NextFn = () => Promise<void>;

export interface NavigationMiddleware {
  handle(ctx: NavigationContext, next: NextFn): Promise<void>;
}

/**
 * Constructor type for middleware classes.
 * Optionally declare a static `factory(injector)` for DI-aware instantiation.
 */
export type MiddlewareConstructor =
  (new () => NavigationMiddleware) &
  { factory?: (injector: Injector) => NavigationMiddleware };
