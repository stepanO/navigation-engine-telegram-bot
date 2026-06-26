/**
 * InMemoryStateStore — reference StateStore implementation.
 *
 * Suitable for development, testing, and single-instance deployments.
 * State is lost on process restart.
 *
 * For production, swap with a Redis or Postgres implementation
 * that satisfies the StateStore interface.
 */

import type { StateStore, StateKey } from '../interfaces/state.js';
import type { NavigationState } from '../interfaces/navigation.js';

export class InMemoryStateStore implements StateStore {
  private readonly store = new Map<StateKey, NavigationState>();

  async get(key: StateKey): Promise<NavigationState | undefined> {
    return this.store.get(key);
  }

  async set(key: StateKey, state: NavigationState): Promise<void> {
    this.store.set(key, state);
  }

  async delete(key: StateKey): Promise<void> {
    this.store.delete(key);
  }

  /** Removes all entries. Useful in tests. */
  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
