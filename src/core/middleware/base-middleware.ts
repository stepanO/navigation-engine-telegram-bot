/**
 * BaseMiddleware — abstract base class for navigation middleware.
 *
 * Subclasses implement `handle()` directly. Call `next()` to continue
 * the chain; omit it to short-circuit (block) the navigation.
 *
 * For the common before/after pattern, call `next()` between your two
 * operations:
 *
 * @example
 * class TimingMiddleware extends BaseMiddleware {
 *   async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
 *     const start = Date.now();
 *     await next();
 *     console.log(`Navigation to ${ctx.route.pathOnly} took ${Date.now() - start}ms`);
 *   }
 * }
 *
 * // Short-circuit example (blocks navigation entirely):
 * class MaintenanceModeMiddleware extends BaseMiddleware {
 *   async handle(_ctx: NavigationContext, _next: NextFn): Promise<void> {
 *     // omit next() — navigation goes no further
 *   }
 * }
 */

import type { NavigationContext } from '../interfaces/navigation.js';
import type { NavigationMiddleware, NextFn } from '../interfaces/middleware.js';

export abstract class BaseMiddleware implements NavigationMiddleware {
  abstract handle(ctx: NavigationContext, next: NextFn): Promise<void>;
}
