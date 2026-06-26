/**
 * Resolver interfaces — Angular Resolve analogue.
 *
 * Resolvers run in parallel after all guards pass.
 * Each resolver key maps to a property in NavigationContext.data.
 *
 * @example
 * engine.register({
 *   path: '/events/:eventId',
 *   component: EventScreen,
 *   resolvers: {
 *     event: EventResolver,
 *     permissions: PermissionResolver,
 *   },
 * });
 * // Inside screen: ctx.data.event, ctx.data.permissions
 */

import type { NavigationContext } from './navigation.js';
import type { Injector } from '../di/injector.js';

/**
 * A resolver loads data before the screen renders.
 * If resolve() throws, the engine routes to the resolver-error screen.
 */
export interface Resolver<T = unknown> {
  resolve(ctx: NavigationContext): Promise<T>;
}

/**
 * Constructor type for resolver classes.
 * Optionally declare a static `factory(injector)` for DI-aware instantiation.
 *
 * Set a static `cacheTtl` (milliseconds) to enable result caching per
 * user/chat/route/params combination. Results are reused until TTL expires.
 * Leave undefined to disable caching (default).
 *
 * @example
 * class EventResolver implements Resolver<Event> {
 *   static readonly cacheTtl = 30_000; // 30 seconds
 *   async resolve(ctx) { ... }
 * }
 */
export type ResolverConstructor<T = unknown> =
  (new () => Resolver<T>) &
  { factory?: (injector: Injector) => Resolver<T>; cacheTtl?: number };

/**
 * Map of resolver keys to resolver constructors.
 * Keys become properties in NavigationContext.data.
 */
export type ResolverMap = Readonly<Record<string, ResolverConstructor>>;
