import { InMemoryRouteSnapshotStore } from '../in-memory-route-snapshot-store.js';
import { SnapshotNotFoundError } from '../../interfaces/errors.js';
import type { RouteSnapshot } from '../route-snapshot.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<RouteSnapshot> = {}): RouteSnapshot {
  return {
    messageId: 1001,
    chatId: 42,
    route: '/users/7',
    params: { id: '7' },
    query: {},
    screenVersion: 1,
    renderedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InMemoryRouteSnapshotStore', () => {
  let store: InMemoryRouteSnapshotStore;

  beforeEach(() => {
    store = new InMemoryRouteSnapshotStore();
  });

  // ── save / find ─────────────────────────────────────────────────────────────

  describe('save()', () => {
    it('stores a snapshot and allows retrieval', async () => {
      const snap = makeSnapshot();
      await store.save(snap);

      const found = await store.find(snap.chatId, snap.messageId);
      expect(found).toEqual(snap);
    });

    it('upserts — replaces an existing snapshot with the same key', async () => {
      const snap = makeSnapshot({ route: '/users/7' });
      await store.save(snap);

      const updated = makeSnapshot({ route: '/users/7?tab=info', renderedAt: new Date('2024-01-15T11:00:00Z') });
      await store.save(updated);

      const found = await store.find(snap.chatId, snap.messageId);
      expect(found?.route).toBe('/users/7?tab=info');
    });

    it('stores snapshots with different (chatId, messageId) keys independently', async () => {
      const a = makeSnapshot({ chatId: 1, messageId: 100, route: '/a' });
      const b = makeSnapshot({ chatId: 1, messageId: 200, route: '/b' });
      const c = makeSnapshot({ chatId: 2, messageId: 100, route: '/c' });

      await store.save(a);
      await store.save(b);
      await store.save(c);

      expect(await store.find(1, 100)).toEqual(a);
      expect(await store.find(1, 200)).toEqual(b);
      expect(await store.find(2, 100)).toEqual(c);
      expect(store.size).toBe(3);
    });

    it('preserves all snapshot fields exactly', async () => {
      const snap = makeSnapshot({
        params: { userId: '99', section: 'profile' },
        query: { tab: 'settings', page: '2' },
        screenVersion: 3,
      });
      await store.save(snap);

      const found = await store.find(snap.chatId, snap.messageId);
      expect(found?.params).toEqual({ userId: '99', section: 'profile' });
      expect(found?.query).toEqual({ tab: 'settings', page: '2' });
      expect(found?.screenVersion).toBe(3);
      expect(found?.renderedAt).toEqual(snap.renderedAt);
    });
  });

  describe('find()', () => {
    it('returns null when no snapshot exists for the key', async () => {
      const result = await store.find(999, 888);
      expect(result).toBeNull();
    });

    it('returns null after the snapshot is deleted', async () => {
      const snap = makeSnapshot();
      await store.save(snap);
      await store.delete(snap.chatId, snap.messageId);

      expect(await store.find(snap.chatId, snap.messageId)).toBeNull();
    });

    it('does not cross-contaminate keys that share only chatId', async () => {
      await store.save(makeSnapshot({ chatId: 5, messageId: 10, route: '/x' }));
      expect(await store.find(5, 99)).toBeNull();
    });

    it('does not cross-contaminate keys that share only messageId', async () => {
      await store.save(makeSnapshot({ chatId: 5, messageId: 10, route: '/x' }));
      expect(await store.find(6, 10)).toBeNull();
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('removes the snapshot', async () => {
      const snap = makeSnapshot();
      await store.save(snap);
      await store.delete(snap.chatId, snap.messageId);

      expect(await store.find(snap.chatId, snap.messageId)).toBeNull();
      expect(store.size).toBe(0);
    });

    it('is idempotent — no error when the key does not exist', async () => {
      await expect(store.delete(999, 888)).resolves.toBeUndefined();
    });

    it('only removes the targeted snapshot, leaving others intact', async () => {
      const a = makeSnapshot({ chatId: 1, messageId: 10, route: '/a' });
      const b = makeSnapshot({ chatId: 1, messageId: 20, route: '/b' });
      await store.save(a);
      await store.save(b);

      await store.delete(1, 10);

      expect(await store.find(1, 10)).toBeNull();
      expect(await store.find(1, 20)).toEqual(b);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('replaces an existing snapshot', async () => {
      const original = makeSnapshot({ screenVersion: 1 });
      await store.save(original);

      const revised = makeSnapshot({ screenVersion: 2, renderedAt: new Date('2024-06-01T00:00:00Z') });
      await store.update(revised);

      const found = await store.find(revised.chatId, revised.messageId);
      expect(found?.screenVersion).toBe(2);
      expect(found?.renderedAt).toEqual(new Date('2024-06-01T00:00:00Z'));
    });

    it('throws SnapshotNotFoundError when the key does not exist', async () => {
      const snap = makeSnapshot({ chatId: 99, messageId: 77 });
      await expect(store.update(snap)).rejects.toThrow(SnapshotNotFoundError);
    });

    it('SnapshotNotFoundError carries the correct chatId and messageId', async () => {
      const snap = makeSnapshot({ chatId: 99, messageId: 77 });
      let caught: SnapshotNotFoundError | undefined;
      try {
        await store.update(snap);
      } catch (e) {
        caught = e as SnapshotNotFoundError;
      }
      expect(caught).toBeInstanceOf(SnapshotNotFoundError);
      expect(caught?.chatId).toBe(99);
      expect(caught?.messageId).toBe(77);
    });

    it('does not create a new entry when used on a missing key', async () => {
      const snap = makeSnapshot();
      try {
        await store.update(snap);
      } catch {
        // expected
      }
      expect(store.size).toBe(0);
    });
  });

  // ── clear / size ─────────────────────────────────────────────────────────────

  describe('clear() and size', () => {
    it('size reflects the number of stored snapshots', async () => {
      expect(store.size).toBe(0);
      await store.save(makeSnapshot({ chatId: 1, messageId: 1 }));
      await store.save(makeSnapshot({ chatId: 1, messageId: 2 }));
      expect(store.size).toBe(2);
    });

    it('clear() removes all snapshots', async () => {
      await store.save(makeSnapshot({ chatId: 1, messageId: 1 }));
      await store.save(makeSnapshot({ chatId: 1, messageId: 2 }));
      store.clear();
      expect(store.size).toBe(0);
    });
  });
});
