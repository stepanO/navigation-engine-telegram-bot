import { ServerStateEncoder, InMemoryCallbackStore } from '../server-state-encoder.js';
import type { CallbackStore } from '../server-state-encoder.js';
import { CallbackDataTooLongError, CALLBACK_DATA_MAX_BYTES } from '../callback-encoder.js';

describe('ServerStateEncoder', () => {
  let encoder: ServerStateEncoder;

  beforeEach(() => {
    encoder = new ServerStateEncoder();
  });

  // ── encodeNavigation ───────────────────────────────────────────────────────

  describe('encodeNavigation()', () => {
    it('returns a short key-based token', () => {
      const encoded = encoder.encodeNavigation('/events/42');
      expect(encoded).toMatch(/^s:/);
    });

    it('token is well within the 64-byte limit', () => {
      const encoded = encoder.encodeNavigation('/events/42');
      expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES);
    });

    it('encodes arbitrarily long paths without exceeding 64 bytes', () => {
      const longPath = '/events/' + 'a'.repeat(200);
      const encoded = encoder.encodeNavigation(longPath);
      expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES);
    });

    it('each call produces a unique key', () => {
      const a = encoder.encodeNavigation('/events/1');
      const b = encoder.encodeNavigation('/events/2');
      expect(a).not.toBe(b);
    });
  });

  // ── encodeBack ─────────────────────────────────────────────────────────────

  describe('encodeBack()', () => {
    it('returns the back token', () => {
      expect(encoder.encodeBack()).toBe('b');
    });
  });

  // ── encodeAction ───────────────────────────────────────────────────────────

  describe('encodeAction()', () => {
    it('encodes an action with no params', () => {
      expect(encoder.encodeAction('delete')).toBe('a:delete');
    });

    it('encodes an action with params', () => {
      expect(encoder.encodeAction('remove', ['42'])).toBe('a:remove:42');
    });

    it('throws CallbackDataTooLongError for oversized action data', () => {
      expect(() => encoder.encodeAction('a'.repeat(63))).toThrow(CallbackDataTooLongError);
    });
  });

  // ── decode ─────────────────────────────────────────────────────────────────

  describe('decode()', () => {
    it('decodes the back token', () => {
      expect(encoder.decode('b')).toEqual({ type: 'back' });
    });

    it('decodes a stored navigation path', () => {
      const encoded = encoder.encodeNavigation('/events/42');
      expect(encoder.decode(encoded)).toEqual({ type: 'navigation', path: '/events/42' });
    });

    it('decodes an action with no params', () => {
      expect(encoder.decode('a:delete')).toEqual({ type: 'action', name: 'delete', params: [] });
    });

    it('decodes an action with params', () => {
      expect(encoder.decode('a:remove:42')).toEqual({ type: 'action', name: 'remove', params: ['42'] });
    });

    it('returns unknown for an unrecognized key', () => {
      expect(encoder.decode('s:xxxxxx')).toEqual({ type: 'unknown' });
    });

    it('returns unknown for completely unrecognized data', () => {
      expect(encoder.decode('nav:/events')).toEqual({ type: 'unknown' });
      expect(encoder.decode('')).toEqual({ type: 'unknown' });
      expect(encoder.decode('random')).toEqual({ type: 'unknown' });
    });
  });

  // ── round-trip ─────────────────────────────────────────────────────────────

  describe('encode/decode round-trip', () => {
    it('round-trips simple paths', () => {
      const path = '/events/42';
      const encoded = encoder.encodeNavigation(path);
      expect(encoder.decode(encoded)).toEqual({ type: 'navigation', path });
    });

    it('round-trips paths with query strings', () => {
      const path = '/events/42?page=2&sort=asc';
      const encoded = encoder.encodeNavigation(path);
      expect(encoder.decode(encoded)).toEqual({ type: 'navigation', path });
    });

    it('round-trips arbitrarily long paths', () => {
      const path = '/a/b/c/d/e/f?x=' + 'z'.repeat(100);
      const encoded = encoder.encodeNavigation(path);
      expect(encoder.decode(encoded)).toEqual({ type: 'navigation', path });
    });

    it('round-trips back', () => {
      expect(encoder.decode(encoder.encodeBack())).toEqual({ type: 'back' });
    });

    it('round-trips actions', () => {
      const encoded = encoder.encodeAction('archive', ['42', 'now']);
      expect(encoder.decode(encoded)).toEqual({ type: 'action', name: 'archive', params: ['42', 'now'] });
    });

    it('multiple round-trips do not cross-contaminate', () => {
      const path1 = '/events/1';
      const path2 = '/events/2';
      const enc1 = encoder.encodeNavigation(path1);
      const enc2 = encoder.encodeNavigation(path2);
      expect(encoder.decode(enc1)).toEqual({ type: 'navigation', path: path1 });
      expect(encoder.decode(enc2)).toEqual({ type: 'navigation', path: path2 });
    });
  });

  // ── InMemoryCallbackStore ──────────────────────────────────────────────────

  describe('InMemoryCallbackStore', () => {
    it('stores and retrieves values', () => {
      const store = new InMemoryCallbackStore();
      store.set('key1', 'value1');
      expect(store.get('key1')).toBe('value1');
    });

    it('returns undefined for missing keys', () => {
      const store = new InMemoryCallbackStore();
      expect(store.get('missing')).toBeUndefined();
    });

    it('overwrites existing values', () => {
      const store = new InMemoryCallbackStore();
      store.set('key', 'first');
      store.set('key', 'second');
      expect(store.get('key')).toBe('second');
    });

    describe('maxSize option', () => {
      it('evicts the oldest entry when capacity is exceeded', () => {
        const store = new InMemoryCallbackStore({ maxSize: 2 });
        store.set('a', '1');
        store.set('b', '2');
        store.set('c', '3'); // evicts 'a'
        expect(store.get('a')).toBeUndefined();
        expect(store.get('b')).toBe('2');
        expect(store.get('c')).toBe('3');
      });

      it('does not evict when updating an existing key', () => {
        const store = new InMemoryCallbackStore({ maxSize: 2 });
        store.set('a', '1');
        store.set('b', '2');
        store.set('a', 'updated'); // update in-place, no eviction
        expect(store.get('a')).toBe('updated');
        expect(store.get('b')).toBe('2');
      });

      it('respects maxSize: 1 — second insert evicts first', () => {
        const store = new InMemoryCallbackStore({ maxSize: 1 });
        store.set('a', '1');
        store.set('b', '2');
        expect(store.get('a')).toBeUndefined();
        expect(store.get('b')).toBe('2');
      });

      it('works correctly with unlimited size by default', () => {
        const store = new InMemoryCallbackStore();
        for (let i = 0; i < 100; i++) {
          store.set(`k${i}`, `v${i}`);
        }
        for (let i = 0; i < 100; i++) {
          expect(store.get(`k${i}`)).toBe(`v${i}`);
        }
      });
    });

    describe('ttlMs option', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it('returns the value before TTL expires', () => {
        const store = new InMemoryCallbackStore({ ttlMs: 1000 });
        store.set('key', 'value');
        jest.advanceTimersByTime(500);
        expect(store.get('key')).toBe('value');
      });

      it('returns undefined after TTL expires', () => {
        const store = new InMemoryCallbackStore({ ttlMs: 1000 });
        store.set('key', 'value');
        jest.advanceTimersByTime(1001);
        expect(store.get('key')).toBeUndefined();
      });

      it('removing expired entries does not affect other keys', () => {
        const store = new InMemoryCallbackStore({ ttlMs: 1000 });
        store.set('short', 'expires');
        jest.advanceTimersByTime(500);
        store.set('long', 'survives');
        jest.advanceTimersByTime(600); // short is now expired (1100ms total), long is not (600ms)
        expect(store.get('short')).toBeUndefined();
        expect(store.get('long')).toBe('survives');
      });

      it('refreshes TTL when key is overwritten', () => {
        const store = new InMemoryCallbackStore({ ttlMs: 1000 });
        store.set('key', 'v1');
        jest.advanceTimersByTime(800);
        store.set('key', 'v2'); // reset TTL
        jest.advanceTimersByTime(800); // 800ms since reset, still alive
        expect(store.get('key')).toBe('v2');
      });
    });
  });

  // ── Custom store injection ─────────────────────────────────────────────────

  describe('custom CallbackStore', () => {
    it('uses the injected store for get/set', () => {
      const store: CallbackStore = {
        get: jest.fn().mockReturnValue('/injected-path'),
        set: jest.fn(),
      };
      const enc = new ServerStateEncoder(store);
      const encoded = enc.encodeNavigation('/some/path');
      expect(store.set).toHaveBeenCalled();
      const decoded = enc.decode(encoded);
      expect(store.get).toHaveBeenCalled();
      expect(decoded).toEqual({ type: 'navigation', path: '/injected-path' });
    });
  });
});
