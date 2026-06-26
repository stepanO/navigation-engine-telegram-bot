import { NavigationStack } from '../navigation-stack.js';
import { NoHistoryError } from '../../interfaces/errors.js';
import type { RouteMatch } from '../../interfaces/route.js';
import type { ScreenComponent, ScreenView } from '../../interfaces/screen.js';
import type { NavigationContext } from '../../interfaces/navigation.js';

class StubScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'stub' };
  }
}

function makeMatch(path: string, params: Record<string, string> = {}): RouteMatch {
  return {
    definition: { path, component: StubScreen },
    params,
    query: {},
    fullPath: path,
    pathOnly: path,
  };
}

describe('NavigationStack', () => {
  let stack: NavigationStack;

  beforeEach(() => {
    stack = new NavigationStack(100, 1);
  });

  describe('push()', () => {
    it('starts empty', () => {
      expect(stack.current()).toBeUndefined();
    });

    it('pushes an entry and sets it as current', () => {
      stack.push(makeMatch('/events'));
      expect(stack.current()?.path).toBe('/events');
    });

    it('builds history across multiple pushes', () => {
      stack.push(makeMatch('/'));
      stack.push(makeMatch('/events'));
      stack.push(makeMatch('/events/42'));
      expect(stack.current()?.path).toBe('/events/42');
      expect(stack.canGoBack()).toBe(true);
    });

    it('discards forward history on push after back', () => {
      stack.push(makeMatch('/'));
      stack.push(makeMatch('/events'));
      stack.back();                         // cursor at /
      stack.push(makeMatch('/organizations')); // forward /events is discarded
      expect(stack.current()?.path).toBe('/organizations');
      // back now goes to /, not /events
      const prev = stack.back();
      expect(prev.path).toBe('/');
    });
  });

  describe('replace()', () => {
    it('replaces current entry', () => {
      stack.push(makeMatch('/events'));
      stack.replace(makeMatch('/events/42'));
      expect(stack.current()?.path).toBe('/events/42');
    });

    it('does not grow history on replace', () => {
      stack.push(makeMatch('/events'));
      stack.push(makeMatch('/organizations'));
      stack.replace(makeMatch('/settings'));
      stack.back();
      expect(stack.current()?.path).toBe('/events');
    });

    it('acts as push when history is empty', () => {
      stack.replace(makeMatch('/events'));
      expect(stack.current()?.path).toBe('/events');
    });
  });

  describe('back()', () => {
    it('throws NoHistoryError when at start', () => {
      expect(() => stack.back()).toThrow(NoHistoryError);
    });

    it('throws NoHistoryError with only one entry', () => {
      stack.push(makeMatch('/'));
      expect(() => stack.back()).toThrow(NoHistoryError);
    });

    it('returns the previous entry', () => {
      stack.push(makeMatch('/'));
      stack.push(makeMatch('/events'));
      const prev = stack.back();
      expect(prev.path).toBe('/');
      expect(stack.current()?.path).toBe('/');
    });
  });

  describe('canGoBack()', () => {
    it('returns false for empty stack', () => {
      expect(stack.canGoBack()).toBe(false);
    });

    it('returns false for single entry', () => {
      stack.push(makeMatch('/'));
      expect(stack.canGoBack()).toBe(false);
    });

    it('returns true for multiple entries', () => {
      stack.push(makeMatch('/'));
      stack.push(makeMatch('/events'));
      expect(stack.canGoBack()).toBe(true);
    });
  });

  describe('reset()', () => {
    it('clears history and starts at given path', () => {
      stack.push(makeMatch('/'));
      stack.push(makeMatch('/events'));
      stack.reset(makeMatch('/'));
      expect(stack.canGoBack()).toBe(false);
      expect(stack.current()?.path).toBe('/');
    });
  });

  describe('maxHistory enforcement', () => {
    it('never exceeds max history size', () => {
      const small = new NavigationStack(100, 1, 3);
      small.push(makeMatch('/a'));
      small.push(makeMatch('/b'));
      small.push(makeMatch('/c'));
      small.push(makeMatch('/d'));
      // /a is dropped; current is /d, can go back to /c and /b
      expect(small.current()?.path).toBe('/d');
      small.back();
      expect(small.current()?.path).toBe('/c');
      small.back();
      expect(small.current()?.path).toBe('/b');
      expect(small.canGoBack()).toBe(false);
    });
  });

  describe('updateMessageId() / getMessageId()', () => {
    it('getMessageId() returns undefined before any update', () => {
      expect(stack.getMessageId()).toBeUndefined();
    });

    it('stores and retrieves a message ID', () => {
      stack.updateMessageId(42);
      expect(stack.getMessageId()).toBe(42);
    });

    it('overwrites the previous message ID', () => {
      stack.updateMessageId(1);
      stack.updateMessageId(99);
      expect(stack.getMessageId()).toBe(99);
    });

    it('persists messageId in toState()', () => {
      stack.push(makeMatch('/'));
      stack.updateMessageId(77);
      const state = stack.toState();
      expect(state.messageId).toBe(77);
    });

    it('restores messageId from persisted state', () => {
      stack.push(makeMatch('/'));
      stack.updateMessageId(55);
      const restored = new NavigationStack(100, 1, 50, stack.toState());
      expect(restored.getMessageId()).toBe(55);
    });
  });

  describe('toState() / restore from state', () => {
    it('serializes and restores state', () => {
      stack.push(makeMatch('/'));
      stack.push(makeMatch('/events'));
      const state = stack.toState();

      const restored = new NavigationStack(100, 1, 50, state);
      expect(restored.current()?.path).toBe('/events');
      expect(restored.canGoBack()).toBe(true);
    });
  });
});
