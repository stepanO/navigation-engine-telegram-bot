import { ActionDispatcher } from '../action-dispatcher.js';
import { BaseActionHandler } from '../base-action-handler.js';
import { ActionNotFoundError, DuplicateActionError } from '../../interfaces/errors.js';
import type { ActionContext, ActionHandler } from '../action-context.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<ActionContext>): ActionContext {
  return {
    name: 'testAction',
    params: [],
    user: { id: 1, firstName: 'Test', isBot: false },
    chat: { id: 100, type: 'private' },
    navigate: async () => {},
    replace: async () => {},
    back: async () => {},
    ...overrides,
  };
}

class NoopHandler extends BaseActionHandler {
  async handle(_ctx: ActionContext): Promise<void> {}
}

class SpyHandler implements ActionHandler {
  received: ActionContext[] = [];
  async handle(ctx: ActionContext): Promise<void> {
    this.received.push(ctx);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ActionDispatcher', () => {
  describe('register()', () => {
    it('returns this for fluent chaining', () => {
      const dispatcher = new ActionDispatcher();
      const result = dispatcher.register('foo', NoopHandler);
      expect(result).toBe(dispatcher);
    });

    it('increments size after registration', () => {
      const dispatcher = new ActionDispatcher();
      dispatcher.register('a', NoopHandler);
      dispatcher.register('b', NoopHandler);
      expect(dispatcher.size).toBe(2);
    });

    it('throws DuplicateActionError when name already registered', () => {
      const dispatcher = new ActionDispatcher();
      dispatcher.register('foo', NoopHandler);
      expect(() => dispatcher.register('foo', NoopHandler))
        .toThrow(DuplicateActionError);
    });

    it('DuplicateActionError carries the duplicate name', () => {
      const dispatcher = new ActionDispatcher();
      dispatcher.register('myAction', NoopHandler);
      try {
        dispatcher.register('myAction', NoopHandler);
        fail('expected DuplicateActionError');
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateActionError);
        expect((err as DuplicateActionError).actionName).toBe('myAction');
      }
    });
  });

  describe('has()', () => {
    it('returns true for registered names', () => {
      const dispatcher = new ActionDispatcher();
      dispatcher.register('foo', NoopHandler);
      expect(dispatcher.has('foo')).toBe(true);
    });

    it('returns false for unregistered names', () => {
      const dispatcher = new ActionDispatcher();
      expect(dispatcher.has('missing')).toBe(false);
    });
  });

  describe('dispatch()', () => {
    it('throws ActionNotFoundError for an unknown action name', async () => {
      const dispatcher = new ActionDispatcher();
      await expect(dispatcher.dispatch(makeCtx({ name: 'ghost' })))
        .rejects.toThrow(ActionNotFoundError);
    });

    it('ActionNotFoundError carries the missing action name', async () => {
      const dispatcher = new ActionDispatcher();
      try {
        await dispatcher.dispatch(makeCtx({ name: 'missingAction' }));
        fail('expected ActionNotFoundError');
      } catch (err) {
        expect(err).toBeInstanceOf(ActionNotFoundError);
        expect((err as ActionNotFoundError).actionName).toBe('missingAction');
      }
    });

    it('dispatches to the correct handler by ctx.name', async () => {
      const dispatcher = new ActionDispatcher();
      const aCalled: string[] = [];
      const bCalled: string[] = [];

      class HandlerA implements ActionHandler {
        async handle(_ctx: ActionContext): Promise<void> { aCalled.push('A'); }
      }
      class HandlerB implements ActionHandler {
        async handle(_ctx: ActionContext): Promise<void> { bCalled.push('B'); }
      }

      dispatcher.register('actionA', HandlerA);
      dispatcher.register('actionB', HandlerB);

      await dispatcher.dispatch(makeCtx({ name: 'actionA' }));
      await dispatcher.dispatch(makeCtx({ name: 'actionB' }));

      expect(aCalled).toEqual(['A']);
      expect(bCalled).toEqual(['B']);
    });

    it('handler receives the full ActionContext', async () => {
      const dispatcher = new ActionDispatcher();
      let received: ActionContext | undefined;

      class CapturingHandler implements ActionHandler {
        async handle(ctx: ActionContext): Promise<void> { received = ctx; }
      }

      dispatcher.register('capture', CapturingHandler);

      const ctx = makeCtx({ name: 'capture', params: ['p1', 'p2'] });
      await dispatcher.dispatch(ctx);

      expect(received).toBeDefined();
      expect(received!.name).toBe('capture');
      expect(received!.params).toEqual(['p1', 'p2']);
    });

    it('handler can call ctx.navigate() to trigger post-action navigation', async () => {
      const dispatcher = new ActionDispatcher();
      let navigatedTo: string | undefined;

      class NavigatingHandler implements ActionHandler {
        async handle(ctx: ActionContext): Promise<void> {
          await ctx.navigate('/result');
        }
      }

      dispatcher.register('go', NavigatingHandler);

      const ctx = makeCtx({
        name: 'go',
        navigate: async (path) => { navigatedTo = path; },
      });
      await dispatcher.dispatch(ctx);

      expect(navigatedTo).toBe('/result');
    });

    it('handler can call ctx.replace() to replace the current route', async () => {
      const dispatcher = new ActionDispatcher();
      let replacedWith: string | undefined;

      class ReplaceHandler implements ActionHandler {
        async handle(ctx: ActionContext): Promise<void> {
          await ctx.replace('/refreshed');
        }
      }

      dispatcher.register('refresh', ReplaceHandler);

      const ctx = makeCtx({
        name: 'refresh',
        replace: async (path) => { replacedWith = path; },
      });
      await dispatcher.dispatch(ctx);

      expect(replacedWith).toBe('/refreshed');
    });

    it('handler can call ctx.back() to go back in history', async () => {
      const dispatcher = new ActionDispatcher();
      let backCalled = false;

      class BackHandler implements ActionHandler {
        async handle(ctx: ActionContext): Promise<void> {
          await ctx.back();
        }
      }

      dispatcher.register('goBack', BackHandler);

      const ctx = makeCtx({
        name: 'goBack',
        back: async () => { backCalled = true; },
      });
      await dispatcher.dispatch(ctx);

      expect(backCalled).toBe(true);
    });

    it('creates a fresh handler instance per dispatch', async () => {
      const dispatcher = new ActionDispatcher();
      const instances: SpyHandler[] = [];

      class TrackingHandler implements ActionHandler {
        async handle(_ctx: ActionContext): Promise<void> {
          instances.push(this as unknown as SpyHandler);
        }
      }

      dispatcher.register('multi', TrackingHandler);

      await dispatcher.dispatch(makeCtx({ name: 'multi' }));
      await dispatcher.dispatch(makeCtx({ name: 'multi' }));

      expect(instances).toHaveLength(2);
      expect(instances[0]).not.toBe(instances[1]);
    });
  });
});
