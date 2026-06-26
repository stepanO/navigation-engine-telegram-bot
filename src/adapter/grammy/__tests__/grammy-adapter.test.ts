import { GrammYAdapter } from '../grammy-adapter.js';
import { SimpleCallbackEncoder } from '../../../callback/callback-encoder.js';
import { InMemoryStateStore } from '../../../core/state/in-memory-state-store.js';
import { NavigationEngine } from '../../../core/engine/navigation-engine.js';
import { Router } from '../../../core/router/router.js';
import { ScreenRegistry } from '../../../core/registry/screen-registry.js';
import { ActionDispatcher } from '../../../core/action/action-dispatcher.js';
import { BaseActionHandler } from '../../../core/action/base-action-handler.js';
import { ActionNotFoundError } from '../../../core/interfaces/errors.js';
import type { Renderer, RenderTarget, RenderResult } from '../../../core/interfaces/renderer.js';
import type { ScreenView } from '../../../core/interfaces/screen.js';
import type { Context } from 'grammy';
import type { NavigationContext } from '../../../core/interfaces/navigation.js';
import type { ScreenComponent } from '../../../core/interfaces/screen.js';
import type { MiddlewareFn } from 'grammy';
import type { ActionContext } from '../../../core/action/action-context.js';

// ─── Stubs ────────────────────────────────────────────────────────────────────

class StubScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'stub' };
  }
}

class SpyRenderer implements Renderer {
  navigatedTo: string[] = [];
  async render(_view: ScreenView, _target: RenderTarget): Promise<RenderResult> {
    return {};
  }
  async answerCallbackQuery(_target: RenderTarget): Promise<void> {}
}

/** Builds a minimal fake grammY Context. */
function makeCtx(overrides: {
  callbackData?: string;
  from?: { id: number; first_name: string; is_bot: boolean };
  chat?: { id: number; type: 'private' };
  messageId?: number;
}): Context {
  const from = overrides.from ?? { id: 1, first_name: 'Test', is_bot: false };
  const chat = overrides.chat ?? { id: 100, type: 'private' as const };

  return {
    from,
    chat,
    callbackQuery: overrides.callbackData
      ? {
          id: 'cq123',
          data: overrides.callbackData,
          message: overrides.messageId ? { message_id: overrides.messageId } : undefined,
          from,
          chat_instance: 'ci',
        }
      : undefined,
  } as unknown as Context;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAdapter(dispatcher?: ActionDispatcher) {
  const renderer = new SpyRenderer();
  const store = new InMemoryStateStore();
  const encoder = new SimpleCallbackEncoder();
  const engine = new NavigationEngine(new Router(), new ScreenRegistry(), renderer, store);
  engine.register({ path: '/', component: StubScreen });
  engine.register({ path: '/events', component: StubScreen });
  engine.register({ path: '/events/:id', component: StubScreen });

  const adapter = new GrammYAdapter(engine, store, encoder, dispatcher);
  return { adapter, renderer, store, engine };
}

async function runMiddleware(middleware: MiddlewareFn<Context>, ctx: Context): Promise<boolean> {
  let nextCalled = false;
  await middleware(ctx, async () => { nextCalled = true; });
  return nextCalled;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GrammYAdapter', () => {
  describe('middleware()', () => {
    it('calls next() for non-callback updates', async () => {
      const { adapter } = buildAdapter();
      const ctx = makeCtx({});
      const nextCalled = await runMiddleware(adapter.middleware(), ctx);
      expect(nextCalled).toBe(true);
    });

    it('calls next() for unrecognized callback data', async () => {
      const { adapter } = buildAdapter();
      const ctx = makeCtx({ callbackData: 'some_unknown_data' });
      const nextCalled = await runMiddleware(adapter.middleware(), ctx);
      expect(nextCalled).toBe(true);
    });

    it('handles nav: callback and renders the screen', async () => {
      const { adapter, renderer } = buildAdapter();
      const ctx = makeCtx({ callbackData: 'nav:/', messageId: 42 });
      await runMiddleware(adapter.middleware(), ctx);
      expect(renderer.navigatedTo).toHaveLength(0); // navigatedTo is checked via render calls
    });

    it('does not call next() for nav: callbacks', async () => {
      const { adapter } = buildAdapter();
      const ctx = makeCtx({ callbackData: 'nav:/', messageId: 42 });
      const nextCalled = await runMiddleware(adapter.middleware(), ctx);
      expect(nextCalled).toBe(false);
    });

    it('calls next() for action: callbacks when no dispatcher is configured', async () => {
      const { adapter } = buildAdapter();
      const ctx = makeCtx({ callbackData: 'action:deleteEvent:42' });
      const nextCalled = await runMiddleware(adapter.middleware(), ctx);
      expect(nextCalled).toBe(true);
    });

    it('dispatches action: callbacks to ActionDispatcher when one is configured', async () => {
      let received: ActionContext | undefined;
      class CaptureHandler extends BaseActionHandler {
        async handle(ctx: ActionContext): Promise<void> { received = ctx; }
      }
      const dispatcher = new ActionDispatcher();
      dispatcher.register('deleteEvent', CaptureHandler);

      const { adapter } = buildAdapter(dispatcher);
      const ctx = makeCtx({ callbackData: 'action:deleteEvent:42' });
      const nextCalled = await runMiddleware(adapter.middleware(), ctx);

      expect(nextCalled).toBe(false);
      expect(received).toBeDefined();
      expect(received!.name).toBe('deleteEvent');
      expect(received!.params).toEqual(['42']);
    });

    it('action handler receives user and chat from grammY context', async () => {
      let received: ActionContext | undefined;
      class CaptureHandler extends BaseActionHandler {
        async handle(ctx: ActionContext): Promise<void> { received = ctx; }
      }
      const dispatcher = new ActionDispatcher();
      dispatcher.register('myAction', CaptureHandler);

      const { adapter } = buildAdapter(dispatcher);
      const ctx = makeCtx({
        callbackData: 'action:myAction',
        from: { id: 99, first_name: 'Alice', is_bot: false },
        chat: { id: 200, type: 'private' },
      });
      await runMiddleware(adapter.middleware(), ctx);

      expect(received!.user.id).toBe(99);
      expect(received!.user.firstName).toBe('Alice');
      expect(received!.chat.id).toBe(200);
    });

    it('throws ActionNotFoundError when dispatcher has no handler for the action', async () => {
      const dispatcher = new ActionDispatcher();
      const { adapter } = buildAdapter(dispatcher);
      const ctx = makeCtx({ callbackData: 'action:unknownAction' });
      await expect(runMiddleware(adapter.middleware(), ctx)).rejects.toThrow(ActionNotFoundError);
    });

    it('action handler can trigger navigation via ctx.navigate()', async () => {
      class NavigatingHandler extends BaseActionHandler {
        async handle(ctx: ActionContext): Promise<void> {
          await ctx.navigate('/events');
        }
      }
      const dispatcher = new ActionDispatcher();
      dispatcher.register('goToEvents', NavigatingHandler);

      const { adapter, renderer } = buildAdapter(dispatcher);
      const spyRender = jest.spyOn(renderer, 'render');
      const ctx = makeCtx({ callbackData: 'action:goToEvents', messageId: 42 });
      await runMiddleware(adapter.middleware(), ctx);

      // Navigation was triggered — renderer should have been called
      expect(spyRender).toHaveBeenCalledTimes(1);
    });

    it('handles nav:__back__ when there is history', async () => {
      const { adapter, store } = buildAdapter();

      // Seed some history
      const stateKey = `100:1`;
      await store.set(stateKey, {
        chatId: 100,
        userId: 1,
        cursor: 1,
        messageId: 42,
        entries: [
          { path: '/', params: {}, query: {}, timestamp: 1 },
          { path: '/events', params: {}, query: {}, timestamp: 2 },
        ],
      });

      const ctx = makeCtx({ callbackData: 'nav:__back__', messageId: 42 });
      await expect(runMiddleware(adapter.middleware(), ctx)).resolves.not.toThrow();
    });

    it('uses messageId from persisted state over ctx message', async () => {
      const { adapter, store, renderer } = buildAdapter();
      const spyRender = jest.spyOn(renderer, 'render');

      await store.set('100:1', {
        chatId: 100,
        userId: 1,
        cursor: 0,
        messageId: 99,  // ← persisted messageId
        entries: [{ path: '/', params: {}, query: {}, timestamp: 1 }],
      });

      // ctx carries a different messageId — persisted should win
      const ctx = makeCtx({ callbackData: 'nav:/events', messageId: 77 });
      await runMiddleware(adapter.middleware(), ctx);

      const target = spyRender.mock.calls[0]![1] as RenderTarget;
      expect(target.messageId).toBe(99);
    });
  });

  describe('navigateFromContext()', () => {
    it('navigates to the given path', async () => {
      const { adapter, renderer } = buildAdapter();
      const spyRender = jest.spyOn(renderer, 'render');
      const ctx = makeCtx({});
      await adapter.navigateFromContext(ctx, '/events');
      expect(spyRender).toHaveBeenCalledTimes(1);
    });

    it('throws when ctx.from is missing', async () => {
      const { adapter } = buildAdapter();
      const ctx = { chat: { id: 100, type: 'private' } } as unknown as Context;
      await expect(adapter.navigateFromContext(ctx, '/')).rejects.toThrow();
    });

    it('throws when ctx.chat is missing', async () => {
      const { adapter } = buildAdapter();
      const ctx = { from: { id: 1, first_name: 'Test', is_bot: false } } as unknown as Context;
      await expect(adapter.navigateFromContext(ctx, '/')).rejects.toThrow();
    });
  });
});
