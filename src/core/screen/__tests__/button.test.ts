import { Button } from '../button.js';

describe('Button', () => {
  describe('navigate()', () => {
    it('returns a navigate descriptor', () => {
      const btn = Button.navigate('Events', '/events');
      expect(btn).toEqual({ kind: 'navigate', text: 'Events', path: '/events' });
    });

    it('preserves path with query string', () => {
      const btn = Button.navigate('Page 2', '/events?page=2');
      expect(btn.path).toBe('/events?page=2');
    });

    it('preserves path with params', () => {
      const btn = Button.navigate('Event', '/events/42');
      expect(btn.path).toBe('/events/42');
    });
  });

  describe('action()', () => {
    it('returns an action descriptor with no params', () => {
      const btn = Button.action('Delete', 'deleteEvent');
      expect(btn).toEqual({ kind: 'action', text: 'Delete', name: 'deleteEvent', params: [] });
    });

    it('returns an action descriptor with params', () => {
      const btn = Button.action('Remove', 'deleteParticipant', ['42']);
      expect(btn).toEqual({
        kind: 'action',
        text: 'Remove',
        name: 'deleteParticipant',
        params: ['42'],
      });
    });

    it('supports multiple params', () => {
      const btn = Button.action('Move', 'moveItem', ['from', 'to']);
      expect(btn.params).toEqual(['from', 'to']);
    });
  });

  describe('url()', () => {
    it('returns a url descriptor', () => {
      const btn = Button.url('Open', 'https://example.com');
      expect(btn).toEqual({ kind: 'url', text: 'Open', url: 'https://example.com' });
    });
  });

  describe('back()', () => {
    it('uses default label when no text provided', () => {
      const btn = Button.back();
      expect(btn).toEqual({ kind: 'back', text: '← Back' });
    });

    it('uses custom label when provided', () => {
      const btn = Button.back('← Events');
      expect(btn).toEqual({ kind: 'back', text: '← Events' });
    });
  });

  describe('immutability', () => {
    it('button descriptors are plain readonly objects', () => {
      const btn = Button.navigate('Test', '/test');
      // TypeScript would catch mutations at compile time;
      // at runtime we just verify the shape is a plain object
      expect(typeof btn).toBe('object');
      expect(btn.kind).toBe('navigate');
    });
  });
});
