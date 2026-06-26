import type { InjectionToken } from './injection-token.js';

/**
 * Injector — the DI container interface.
 *
 * Implementations provide synchronous value resolution.
 * The engine and registry call get() at navigation time (not at registration time),
 * so lazily-initialized services are fine.
 */
export interface Injector {
  get<T>(token: InjectionToken<T>): T;
}
