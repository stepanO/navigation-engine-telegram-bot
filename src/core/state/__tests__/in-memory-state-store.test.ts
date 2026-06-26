import { InMemoryStateStore } from '../in-memory-state-store.js';
import type { NavigationState } from '../../interfaces/navigation.js';

function makeState(chatId: number, userId: number): NavigationState {
  return {
    chatId,
    userId,
    entries: [],
    cursor: 0,
  };
}

describe('InMemoryStateStore', () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  describe('get() / set()', () => {
    it('returns undefined for unknown keys', async () => {
      expect(await store.get('missing')).toBeUndefined();
    });

    it('stores and retrieves state by key', async () => {
      const state = makeState(1, 2);
      await store.set('1:2', state);
      expect(await store.get('1:2')).toBe(state);
    });

    it('overwrites existing state', async () => {
      const state1 = makeState(1, 2);
      const state2 = makeState(1, 2);
      await store.set('1:2', state1);
      await store.set('1:2', state2);
      expect(await store.get('1:2')).toBe(state2);
    });
  });

  describe('delete()', () => {
    it('removes a stored entry', async () => {
      await store.set('1:2', makeState(1, 2));
      await store.delete('1:2');
      expect(await store.get('1:2')).toBeUndefined();
    });

    it('does not throw when deleting a non-existent key', async () => {
      await expect(store.delete('no-such-key')).resolves.toBeUndefined();
    });
  });

  describe('clear()', () => {
    it('removes all entries', async () => {
      await store.set('1:1', makeState(1, 1));
      await store.set('2:2', makeState(2, 2));
      store.clear();
      expect(await store.get('1:1')).toBeUndefined();
      expect(await store.get('2:2')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('is 0 for an empty store', () => {
      expect(store.size).toBe(0);
    });

    it('increments as entries are added', async () => {
      await store.set('1:1', makeState(1, 1));
      expect(store.size).toBe(1);
      await store.set('2:2', makeState(2, 2));
      expect(store.size).toBe(2);
    });

    it('decrements after delete', async () => {
      await store.set('1:1', makeState(1, 1));
      await store.delete('1:1');
      expect(store.size).toBe(0);
    });

    it('resets to 0 after clear()', async () => {
      await store.set('1:1', makeState(1, 1));
      await store.set('2:2', makeState(2, 2));
      store.clear();
      expect(store.size).toBe(0);
    });
  });
});
