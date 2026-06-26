import type { Injector } from './injector.js';
import type { InjectionToken } from './injection-token.js';
import { InjectionError } from '../interfaces/errors.js';

/**
 * SimpleInjector — synchronous, map-based DI container.
 *
 * Suitable for test environments and simple bots.
 * Production deployments can swap in async factory-based containers
 * by implementing the `Injector` interface.
 *
 * @example
 * const injector = new SimpleInjector()
 *   .bind(EVENT_SERVICE, new EventServiceImpl())
 *   .bind(USER_REPO, new UserRepository(db));
 */
export class SimpleInjector implements Injector {
  private readonly bindings = new Map<InjectionToken<unknown>, unknown>();

  /**
   * Register a value for a token.
   * Fluent — returns `this` for chaining.
   * Rebinding an existing token replaces the previous value.
   */
  bind<T>(token: InjectionToken<T>, value: T): this {
    this.bindings.set(token as InjectionToken<unknown>, value);
    return this;
  }

  /**
   * Resolve a token to its registered value.
   * @throws InjectionError if no binding exists for the token.
   */
  get<T>(token: InjectionToken<T>): T {
    if (!this.bindings.has(token as InjectionToken<unknown>)) {
      throw new InjectionError(token);
    }
    return this.bindings.get(token as InjectionToken<unknown>) as T;
  }

  /** Returns true if a binding exists for the given token. */
  has<T>(token: InjectionToken<T>): boolean {
    return this.bindings.has(token as InjectionToken<unknown>);
  }

  /** Number of registered bindings. */
  get size(): number {
    return this.bindings.size;
  }
}
