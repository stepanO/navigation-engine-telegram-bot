/**
 * BaseResolver — abstract base class for route data resolvers.
 *
 * Extend this to create type-safe resolvers. The resolved value lands
 * in NavigationContext.data under the key used in the route's `resolvers` map.
 *
 * @example
 * class EventResolver extends BaseResolver<Event> {
 *   async resolve(ctx: NavigationContext): Promise<Event> {
 *     return fetchEvent(ctx.params['eventId']!);
 *   }
 * }
 *
 * // Registration:
 * engine.register({
 *   path: '/events/:eventId',
 *   component: EventScreen,
 *   resolvers: { event: EventResolver },
 * });
 */

import type { NavigationContext } from '../interfaces/navigation.js';
import type { Resolver } from '../interfaces/resolver.js';

export abstract class BaseResolver<T = unknown> implements Resolver<T> {
  abstract resolve(ctx: NavigationContext): Promise<T>;
}
