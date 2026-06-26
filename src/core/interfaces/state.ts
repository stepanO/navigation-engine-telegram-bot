/**
 * StateStore interface — persists per-user navigation state.
 *
 * Phase 1 ships InMemoryStateStore (lost on restart).
 * Production deployments swap in Redis, DynamoDB, or Postgres adapters.
 *
 * Key is typically `${chatId}:${userId}` for per-user-per-chat state.
 */

import type { NavigationState } from './navigation.js';

export type StateKey = string;

export interface StateStore {
  get(key: StateKey): Promise<NavigationState | undefined>;
  set(key: StateKey, state: NavigationState): Promise<void>;
  delete(key: StateKey): Promise<void>;
}

/** Builds the canonical state key from chat and user IDs. */
export function buildStateKey(chatId: number, userId: number): StateKey {
  return `${chatId}:${userId}`;
}
