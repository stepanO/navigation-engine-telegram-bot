/**
 * InMemoryRouteSnapshotStore — reference RouteSnapshotStore implementation.
 *
 * Suitable for unit tests and single-instance development deployments.
 * Snapshots are lost on process restart — this is the exact scenario that
 * RouteSnapshotStore is designed to survive in production.
 *
 * For production, implement RouteSnapshotStore against a durable backend
 * (Redis, Postgres, etc.). The interface is purposely narrow so any backend
 * can be adapted without structural changes to NavigationEngine.
 *
 * Key format: "${chatId}:${messageId}" (mirrors the (chatId, messageId) lookup key).
 */

import type { RouteSnapshotStore, RouteSnapshot } from './route-snapshot.js';
import { SnapshotNotFoundError } from '../interfaces/errors.js';

export class InMemoryRouteSnapshotStore implements RouteSnapshotStore {
  private readonly store = new Map<string, RouteSnapshot>();

  private static key(chatId: number, messageId: number): string {
    return `${chatId}:${messageId}`;
  }

  /**
   * Upsert — creates or replaces the snapshot keyed by (chatId, messageId).
   * Called automatically by NavigationEngine after every successful render.
   */
  async save(snapshot: RouteSnapshot): Promise<void> {
    this.store.set(InMemoryRouteSnapshotStore.key(snapshot.chatId, snapshot.messageId), snapshot);
  }

  /**
   * Returns the snapshot for (chatId, messageId), or null if not found.
   * Never throws on a missing key.
   */
  async find(chatId: number, messageId: number): Promise<RouteSnapshot | null> {
    return this.store.get(InMemoryRouteSnapshotStore.key(chatId, messageId)) ?? null;
  }

  /**
   * Removes the snapshot for (chatId, messageId).
   * No-op when the key does not exist (idempotent).
   */
  async delete(chatId: number, messageId: number): Promise<void> {
    this.store.delete(InMemoryRouteSnapshotStore.key(chatId, messageId));
  }

  /**
   * Strict update — replaces an existing snapshot.
   * Throws SnapshotNotFoundError when the key is absent so callers get an
   * explicit error instead of silently creating a ghost entry.
   */
  async update(snapshot: RouteSnapshot): Promise<void> {
    const key = InMemoryRouteSnapshotStore.key(snapshot.chatId, snapshot.messageId);
    if (!this.store.has(key)) {
      throw new SnapshotNotFoundError(snapshot.chatId, snapshot.messageId);
    }
    this.store.set(key, snapshot);
  }

  /** Removes all entries. Useful in tests to isolate state between cases. */
  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
