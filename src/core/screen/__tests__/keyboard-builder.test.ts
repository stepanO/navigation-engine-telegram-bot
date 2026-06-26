import { KeyboardBuilder } from '../keyboard-builder.js';
import { Button } from '../button.js';
import { SimpleCallbackEncoder, CallbackDataTooLongError } from '../../../callback/callback-encoder.js';
import type { CallbackDataEncoder, DecodedCallback } from '../../../callback/callback-encoder.js';

describe('KeyboardBuilder', () => {
  describe('build() — structure', () => {
    it('returns empty inline_keyboard for no rows', () => {
      const kb = new KeyboardBuilder().build();
      expect(kb.inline_keyboard).toEqual([]);
    });

    it('ignores .row() calls with no buttons', () => {
      const kb = new KeyboardBuilder().row().build();
      expect(kb.inline_keyboard).toHaveLength(0);
    });

    it('produces one row', () => {
      const kb = new KeyboardBuilder()
        .row(Button.navigate('Events', '/events'))
        .build();
      expect(kb.inline_keyboard).toHaveLength(1);
    });

    it('produces multiple rows', () => {
      const kb = new KeyboardBuilder()
        .row(Button.navigate('Events', '/events'))
        .row(Button.navigate('Settings', '/settings'))
        .row(Button.back())
        .build();
      expect(kb.inline_keyboard).toHaveLength(3);
    });

    it('places multiple buttons in the same row', () => {
      const kb = new KeyboardBuilder()
        .row(
          Button.navigate('Events', '/events'),
          Button.navigate('Settings', '/settings'),
        )
        .build();
      expect(kb.inline_keyboard[0]).toHaveLength(2);
    });

    it('is non-destructive — build() can be called multiple times', () => {
      const builder = new KeyboardBuilder().row(Button.back());
      const first = builder.build();
      const second = builder.build();
      expect(first).toEqual(second);
    });
  });

  describe('navigate button encoding', () => {
    it('encodes path as nav: callback_data', () => {
      const kb = new KeyboardBuilder()
        .row(Button.navigate('Events', '/events'))
        .build();
      const btn = kb.inline_keyboard[0]![0]!;
      expect(btn.callback_data).toBe('nav:/events');
    });

    it('encodes path with query string', () => {
      const kb = new KeyboardBuilder()
        .row(Button.navigate('Page 2', '/events?page=2'))
        .build();
      expect(kb.inline_keyboard[0]![0]!.callback_data).toBe('nav:/events?page=2');
    });

    it('preserves button text', () => {
      const kb = new KeyboardBuilder()
        .row(Button.navigate('My Events', '/events'))
        .build();
      expect(kb.inline_keyboard[0]![0]!.text).toBe('My Events');
    });
  });

  describe('action button encoding', () => {
    it('encodes action with no params', () => {
      const kb = new KeyboardBuilder()
        .row(Button.action('Delete', 'deleteEvent'))
        .build();
      expect(kb.inline_keyboard[0]![0]!.callback_data).toBe('action:deleteEvent');
    });

    it('encodes action with params', () => {
      const kb = new KeyboardBuilder()
        .row(Button.action('Remove', 'deleteParticipant', ['42']))
        .build();
      expect(kb.inline_keyboard[0]![0]!.callback_data).toBe('action:deleteParticipant:42');
    });
  });

  describe('back button encoding', () => {
    it('encodes back as nav:__back__', () => {
      const kb = new KeyboardBuilder()
        .row(Button.back())
        .build();
      expect(kb.inline_keyboard[0]![0]!.callback_data).toBe('nav:__back__');
    });

    it('uses the custom label text', () => {
      const kb = new KeyboardBuilder()
        .row(Button.back('← Events'))
        .build();
      expect(kb.inline_keyboard[0]![0]!.text).toBe('← Events');
    });
  });

  describe('url button encoding', () => {
    it('sets url field and has no callback_data', () => {
      const kb = new KeyboardBuilder()
        .row(Button.url('Open website', 'https://example.com'))
        .build();
      const btn = kb.inline_keyboard[0]![0]!;
      expect(btn.url).toBe('https://example.com');
      expect(btn.callback_data).toBeUndefined();
    });
  });

  describe('encoder error propagation', () => {
    it('throws CallbackDataTooLongError for paths exceeding 64 bytes', () => {
      const longPath = '/' + 'a'.repeat(61);
      expect(() =>
        new KeyboardBuilder().row(Button.navigate('Long', longPath)).build()
      ).toThrow(CallbackDataTooLongError);
    });
  });

  describe('custom encoder injection', () => {
    it('uses the injected encoder for navigation', () => {
      const calls: string[] = [];
      const spyEncoder: CallbackDataEncoder = {
        encodeNavigation: (path) => { calls.push(`nav:${path}`); return `spy:${path}`; },
        encodeBack: () => 'spy:back',
        encodeAction: (name) => `spy:${name}`,
        decode: (): DecodedCallback => ({ type: 'unknown' }),
      };

      const kb = new KeyboardBuilder(spyEncoder)
        .row(Button.navigate('Events', '/events'))
        .build();

      expect(calls).toEqual(['nav:/events']);
      expect(kb.inline_keyboard[0]![0]!.callback_data).toBe('spy:/events');
    });

    it('uses the injected encoder for back', () => {
      const spyEncoder: CallbackDataEncoder = {
        encodeNavigation: (p) => `nav:${p}`,
        encodeBack: () => 'custom:back',
        encodeAction: (n) => `action:${n}`,
        decode: (): DecodedCallback => ({ type: 'unknown' }),
      };

      const kb = new KeyboardBuilder(spyEncoder).row(Button.back()).build();
      expect(kb.inline_keyboard[0]![0]!.callback_data).toBe('custom:back');
    });
  });

  describe('round-trip with SimpleCallbackEncoder', () => {
    it('decoded navigation matches original path', () => {
      const encoder = new SimpleCallbackEncoder();
      const kb = new KeyboardBuilder(encoder)
        .row(Button.navigate('Events', '/events/42?page=2'))
        .build();

      const callbackData = kb.inline_keyboard[0]![0]!.callback_data!;
      const decoded = encoder.decode(callbackData);
      expect(decoded).toEqual({ type: 'navigation', path: '/events/42?page=2' });
    });
  });
});
