import { CompactCallbackEncoder } from '../compact-callback-encoder.js';
import { CallbackDataTooLongError, CALLBACK_DATA_MAX_BYTES } from '../callback-encoder.js';

describe('CompactCallbackEncoder', () => {
  let encoder: CompactCallbackEncoder;

  beforeEach(() => {
    encoder = new CompactCallbackEncoder();
    encoder
      .registerRoute('/')
      .registerRoute('/events')
      .registerRoute('/events/:eventId')
      .registerRoute('/events/:eventId/items/:itemId');
  });

  // ── registerRoute ──────────────────────────────────────────────────────────

  describe('registerRoute()', () => {
    it('returns this for chaining', () => {
      const enc = new CompactCallbackEncoder();
      expect(enc.registerRoute('/test')).toBe(enc);
    });

    it('increments size on each new route', () => {
      const enc = new CompactCallbackEncoder();
      expect(enc.size).toBe(0);
      enc.registerRoute('/a');
      expect(enc.size).toBe(1);
      enc.registerRoute('/b');
      expect(enc.size).toBe(2);
    });

    it('ignores duplicate registrations', () => {
      const enc = new CompactCallbackEncoder();
      enc.registerRoute('/events');
      enc.registerRoute('/events');
      expect(enc.size).toBe(1);
    });
  });

  // ── encodeNavigation ───────────────────────────────────────────────────────

  describe('encodeNavigation()', () => {
    it('encodes a root path', () => {
      const encoded = encoder.encodeNavigation('/');
      expect(encoded).toBe('c:00');
    });

    it('encodes a static path', () => {
      const encoded = encoder.encodeNavigation('/events');
      expect(encoded).toBe('c:01');
    });

    it('encodes a path with one param', () => {
      const encoded = encoder.encodeNavigation('/events/42');
      expect(encoded).toBe('c:02:42');
    });

    it('encodes a path with two params', () => {
      const encoded = encoder.encodeNavigation('/events/42/items/7');
      expect(encoded).toBe('c:03:42:7');
    });

    it('encodes a path with a query string', () => {
      const encoded = encoder.encodeNavigation('/events?page=2');
      expect(encoded).toBe('c:01:page=2');
    });

    it('encodes a path with params and query', () => {
      const encoded = encoder.encodeNavigation('/events/42?page=3');
      expect(encoded).toBe('c:02:42:page=3');
    });

    it('encodes multiple query params', () => {
      const encoded = encoder.encodeNavigation('/events/42?page=1&sort=asc');
      expect(encoded).toMatch(/^c:02:42:/);
      // Order of query params may vary; decode should be canonical
      const decoded = encoder.decode(encoded);
      expect(decoded.type).toBe('navigation');
    });

    it('produces output shorter than SimpleCallbackEncoder for long paths', () => {
      // A path like /events/123456789 = 19 chars → 'nav:/events/123456789' = 21 bytes
      // Compact: 'c:02:123456789' = 14 bytes
      const encoded = encoder.encodeNavigation('/events/123456789');
      expect(Buffer.byteLength(encoded)).toBeLessThan(Buffer.byteLength('nav:/events/123456789'));
    });

    it('fits within 64 bytes for a path that exceeds SimpleCallbackEncoder limit', () => {
      // Build a path that exceeds 60 bytes when prefixed with 'nav:'
      // e.g., /events/99999999999 → nav:/events/99999999999 = 24 bytes (ok for simple)
      // Use a longer ID that would push SimpleCallbackEncoder over 64 bytes:
      const longId = '9'.repeat(55); // makes nav:/events/{55 nines} = 4+8+55 = 67 bytes
      const enc = new CompactCallbackEncoder();
      enc.registerRoute('/events/:eventId');
      const encoded = enc.encodeNavigation(`/events/${longId}`);
      expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES);
    });

    it('throws for an unregistered path', () => {
      expect(() => encoder.encodeNavigation('/unknown/path')).toThrow(
        'CompactCallbackEncoder: no registered route matches',
      );
    });

    it('throws CallbackDataTooLongError when encoded output exceeds 64 bytes', () => {
      // 'a:' prefix (2 bytes) + 63 chars = 65 bytes > 64 limit
      expect(() =>
        encoder.encodeAction('a'.repeat(63)),
      ).toThrow(CallbackDataTooLongError);
    });
  });

  // ── encodeBack ─────────────────────────────────────────────────────────────

  describe('encodeBack()', () => {
    it('returns the back token', () => {
      expect(encoder.encodeBack()).toBe('b');
    });

    it('is a single byte', () => {
      expect(Buffer.byteLength(encoder.encodeBack())).toBe(1);
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

    it('encodes multiple params', () => {
      expect(encoder.encodeAction('move', ['src', 'dst'])).toBe('a:move:src:dst');
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

    it('decodes a root navigation token', () => {
      expect(encoder.decode('c:00')).toEqual({ type: 'navigation', path: '/' });
    });

    it('decodes a static path token', () => {
      expect(encoder.decode('c:01')).toEqual({ type: 'navigation', path: '/events' });
    });

    it('decodes a single-param token', () => {
      expect(encoder.decode('c:02:42')).toEqual({ type: 'navigation', path: '/events/42' });
    });

    it('decodes a two-param token', () => {
      expect(encoder.decode('c:03:42:7')).toEqual({ type: 'navigation', path: '/events/42/items/7' });
    });

    it('decodes a token with a query param', () => {
      expect(encoder.decode('c:01:page=2')).toEqual({ type: 'navigation', path: '/events?page=2' });
    });

    it('decodes a token with param and query', () => {
      expect(encoder.decode('c:02:42:page=3')).toEqual({ type: 'navigation', path: '/events/42?page=3' });
    });

    it('decodes an action with no params', () => {
      expect(encoder.decode('a:delete')).toEqual({ type: 'action', name: 'delete', params: [] });
    });

    it('decodes an action with params', () => {
      expect(encoder.decode('a:remove:42')).toEqual({ type: 'action', name: 'remove', params: ['42'] });
    });

    it('returns unknown for unrecognized data', () => {
      expect(encoder.decode('nav:/events')).toEqual({ type: 'unknown' });
      expect(encoder.decode('')).toEqual({ type: 'unknown' });
      expect(encoder.decode('totally-random')).toEqual({ type: 'unknown' });
    });

    it('returns unknown for an unregistered route ID', () => {
      // 'c:zz' would be route ID 1295, which was never registered
      expect(encoder.decode('c:zz')).toEqual({ type: 'unknown' });
    });
  });

  // ── round-trip ─────────────────────────────────────────────────────────────

  describe('encode/decode round-trip', () => {
    it('round-trips root path', () => {
      const path = '/';
      expect(encoder.decode(encoder.encodeNavigation(path))).toEqual({ type: 'navigation', path });
    });

    it('round-trips static path', () => {
      const path = '/events';
      expect(encoder.decode(encoder.encodeNavigation(path))).toEqual({ type: 'navigation', path });
    });

    it('round-trips path with single param', () => {
      const path = '/events/99';
      expect(encoder.decode(encoder.encodeNavigation(path))).toEqual({ type: 'navigation', path });
    });

    it('round-trips path with two params', () => {
      const path = '/events/99/items/7';
      expect(encoder.decode(encoder.encodeNavigation(path))).toEqual({ type: 'navigation', path });
    });

    it('round-trips path with query string', () => {
      const path = '/events/42?page=2';
      expect(encoder.decode(encoder.encodeNavigation(path))).toEqual({ type: 'navigation', path });
    });

    it('round-trips back', () => {
      expect(encoder.decode(encoder.encodeBack())).toEqual({ type: 'back' });
    });

    it('round-trips action', () => {
      const encoded = encoder.encodeAction('archive', ['42', 'now']);
      expect(encoder.decode(encoded)).toEqual({ type: 'action', name: 'archive', params: ['42', 'now'] });
    });
  });

  // ── size ───────────────────────────────────────────────────────────────────

  describe('size', () => {
    it('reports the number of registered routes', () => {
      expect(encoder.size).toBe(4);
    });
  });
});
