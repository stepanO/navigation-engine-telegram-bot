/**
 * ScreenRegistry — maps route paths to screen component constructors.
 *
 * Decoupled from the Router intentionally:
 *   - Router is pure path-matching logic.
 *   - Registry is the component lookup table.
 *   - NavigationEngine composes both.
 *
 * This separation allows swapping the routing algorithm without touching
 * screen component management, and vice versa.
 *
 * Phase 9 additions:
 *   - Lazy loading: component may be a factory function `() => ScreenComponentConstructor`.
 *     The factory is called on first access and the result is cached.
 *   - Singleton caching: when a screen class declares `static readonly singleton = true`,
 *     the registry reuses the same instance across navigations.
 */

import type { RouteDefinition } from '../interfaces/route.js';
import type { ScreenComponent, ScreenComponentConstructor } from '../interfaces/screen.js';
import type { LazyComponentFactory } from '../interfaces/route.js';
import type { Injector } from '../di/injector.js';
import { RouteNotFoundError } from '../interfaces/errors.js';

export class ScreenRegistry {
  private readonly rawMap = new Map<string, ScreenComponentConstructor | LazyComponentFactory>();
  private readonly resolvedMap = new Map<string, ScreenComponentConstructor>();
  private readonly singletonCache = new Map<string, ScreenComponent>();

  /**
   * Register a screen component for the given route's path pattern.
   * Called automatically by NavigationEngine.register().
   */
  register(definition: RouteDefinition): void {
    this.rawMap.set(definition.path, definition.component);
  }

  /**
   * Retrieve the constructor for a registered path, resolving lazy factories
   * on first access and caching the result.
   * Throws RouteNotFoundError if the path is unknown.
   */
  getConstructor(path: string): ScreenComponentConstructor {
    const cached = this.resolvedMap.get(path);
    if (cached) return cached;

    const raw = this.rawMap.get(path);
    if (raw === undefined) {
      throw new RouteNotFoundError(path);
    }

    const ctor = isLazyFactory(raw) ? raw() : raw;
    this.resolvedMap.set(path, ctor);
    return ctor;
  }

  /**
   * Instantiate a screen component for the given path.
   *
   * When the constructor declares `static readonly singleton = true`, the
   * same instance is reused across all navigations to this screen.
   *
   * When an injector is provided and the constructor declares a static
   * `factory(injector)` method, that factory is called instead of `new Ctor()`.
   * Screens without a factory always use `new Ctor()` regardless of the injector.
   */
  createScreen(path: string, injector?: Injector): ScreenComponent {
    const Ctor = this.getConstructor(path);

    if (Ctor.singleton) {
      const cached = this.singletonCache.get(path);
      if (cached) return cached;
      const instance = createInjectable(Ctor, injector);
      this.singletonCache.set(path, instance);
      return instance;
    }

    return createInjectable(Ctor, injector);
  }

  /** Returns true if a screen is registered for the given path pattern. */
  has(path: string): boolean {
    return this.rawMap.has(path);
  }

  /** Number of registered screens. */
  get size(): number {
    return this.rawMap.size;
  }
}

/**
 * Instantiate a class using its static `factory(injector)` when available,
 * or fall back to a no-arg `new Ctor()`.
 *
 * Exported so NavigationEngine can reuse it for guards, resolvers, and middleware.
 */
export function createInjectable<T>(
  Ctor: (new () => T) & { factory?: (injector: Injector) => T },
  injector: Injector | undefined,
): T {
  if (injector !== undefined && typeof Ctor.factory === 'function') {
    return Ctor.factory(injector);
  }
  return new Ctor();
}

/**
 * Returns true when the component slot holds a lazy factory (arrow function)
 * rather than a constructor (class). Arrow functions have no `prototype`.
 */
function isLazyFactory(
  component: ScreenComponentConstructor | LazyComponentFactory,
): component is LazyComponentFactory {
  return typeof (component as { prototype?: unknown }).prototype === 'undefined';
}
