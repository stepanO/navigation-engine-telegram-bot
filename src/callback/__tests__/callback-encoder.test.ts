import {
  SimpleCallbackEncoder,
  CallbackDataTooLongError,
  CALLBACK_DATA_MAX_BYTES,
} from '../callback-encoder.js';

describe('SimpleCallbackEncoder', () => {
  let encoder: SimpleCallbackEncoder;

  beforeEach(() => {
    encoder = new SimpleCallbackEncoder();
  });

  // ── encodeNavigation ──────────────────────────────────────────────────────

  describe('encodeNavigation()', () => {
    it('encodes a simple path', () => {
      expect(encoder.encodeNavigation('/events')).toBe('nav:/events');
    });

    it('encodes a path with params', () => {
      expect(encoder.encodeNavigation('/events/42')).toBe('nav:/events/42');
    });

    it('encodes a path with query string', () => {
      expect(encoder.encodeNavigation('/events/42?page=2')).toBe('nav:/events/42?page=2');
    });

    it('throws CallbackDataTooLongError for paths exceeding 64 bytes', () => {
      // 61 chars of path + 4 prefix = 65 bytes
      const longPath = '/' + 'a'.repeat(60);
      expect(() => encoder.encodeNavigation(longPath)).toThrow(CallbackDataTooLongError);
    });

    it('accepts a path that is exactly 64 bytes', () => {
      // 'nav:' = 4 bytes, so path can be at most 60 bytes
      const path = '/' + 'a'.repeat(59); // 60 bytes total
      expect(() => encoder.encodeNavigation(path)).not.toThrow();
      expect(Buffer.byteLength(encoder.encodeNavigation(path))).toBe(CALLBACK_DATA_MAX_BYTES);
    });
  });

  // ── encodeBack ────────────────────────────────────────────────────────────

  describe('encodeBack()', () => {
    it('returns the back token', () => {
      expect(encoder.encodeBack()).toBe('nav:__back__');
    });
  });

  // ── encodeAction ──────────────────────────────────────────────────────────

  describe('encodeAction()', () => {
    it('encodes an action with no params', () => {
      expect(encoder.encodeAction('deleteEvent')).toBe('action:deleteEvent');
    });

    it('encodes an action with params', () => {
      expect(encoder.encodeAction('deleteParticipant', ['42'])).toBe('action:deleteParticipant:42');
    });

    it('encodes multiple params', () => {
      expect(encoder.encodeAction('move', ['src', 'dst'])).toBe('action:move:src:dst');
    });

    it('throws for action data exceeding 64 bytes', () => {
      const longName = 'a'.repeat(60);
      expect(() => encoder.encodeAction(longName)).toThrow(CallbackDataTooLongError);
    });
  });

  // ── decode ────────────────────────────────────────────────────────────────

  describe('decode()', () => {
    it('decodes a navigation callback', () => {
      const decoded = encoder.decode('nav:/events/42');
      expect(decoded).toEqual({ type: 'navigation', path: '/events/42' });
    });

    it('decodes a navigation callback with query string', () => {
      const decoded = encoder.decode('nav:/events/42?page=2');
      expect(decoded).toEqual({ type: 'navigation', path: '/events/42?page=2' });
    });

    it('decodes the back token', () => {
      expect(encoder.decode('nav:__back__')).toEqual({ type: 'back' });
    });

    it('decodes an action with no params', () => {
      const decoded = encoder.decode('action:deleteEvent');
      expect(decoded).toEqual({ type: 'action', name: 'deleteEvent', params: [] });
    });

    it('decodes an action with params', () => {
      const decoded = encoder.decode('action:deleteParticipant:42');
      expect(decoded).toEqual({ type: 'action', name: 'deleteParticipant', params: ['42'] });
    });

    it('decodes an action with multiple params', () => {
      const decoded = encoder.decode('action:move:src:dst');
      expect(decoded).toEqual({ type: 'action', name: 'move', params: ['src', 'dst'] });
    });

    it('returns unknown for unrecognized data', () => {
      expect(encoder.decode('totally-random')).toEqual({ type: 'unknown' });
      expect(encoder.decode('')).toEqual({ type: 'unknown' });
      expect(encoder.decode('navi:/events')).toEqual({ type: 'unknown' });
    });
  });

  // ── round-trip ────────────────────────────────────────────────────────────

  describe('encode/decode round-trip', () => {
    it('round-trips navigation paths', () => {
      const path = '/events/42?page=3&sort=name';
      const encoded = encoder.encodeNavigation(path);
      const decoded = encoder.decode(encoded);
      expect(decoded).toEqual({ type: 'navigation', path });
    });

    it('round-trips action calls', () => {
      const encoded = encoder.encodeAction('archive', ['42', 'immediate']);
      const decoded = encoder.decode(encoded);
      expect(decoded).toEqual({ type: 'action', name: 'archive', params: ['42', 'immediate'] });
    });

    it('round-trips back', () => {
      expect(encoder.decode(encoder.encodeBack())).toEqual({ type: 'back' });
    });
  });

  // ── error details ─────────────────────────────────────────────────────────

  describe('CallbackDataTooLongError', () => {
    it('includes the encoded string and byte count in the message', () => {
      const longPath = '/' + 'a'.repeat(65);
      let err: CallbackDataTooLongError | undefined;
      try {
        encoder.encodeNavigation(longPath);
      } catch (e) {
        err = e as CallbackDataTooLongError;
      }
      expect(err).toBeInstanceOf(CallbackDataTooLongError);
      expect(err!.byteLength).toBeGreaterThan(CALLBACK_DATA_MAX_BYTES);
      expect(err!.message).toContain('64 bytes');
    });
  });
});
