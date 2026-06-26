import { BaseActionHandler } from '../base-action-handler.js';
import type { ActionContext } from '../action-context.js';

function makeCtx(overrides?: Partial<ActionContext>): ActionContext {
  return {
    name: 'test',
    params: [],
    user: { id: 1, firstName: 'Test', isBot: false },
    chat: { id: 100, type: 'private' },
    navigate: async () => {},
    replace: async () => {},
    back: async () => {},
    ...overrides,
  };
}

class EchoHandler extends BaseActionHandler {
  lastParams: readonly string[] = [];
  async handle(ctx: ActionContext): Promise<void> {
    this.lastParams = ctx.params;
  }
}

describe('BaseActionHandler', () => {
  it('can be extended and handle() is called', async () => {
    const handler = new EchoHandler();
    await handler.handle(makeCtx({ params: ['42', 'foo'] }));
    expect(handler.lastParams).toEqual(['42', 'foo']);
  });

  it('receives the full ActionContext', async () => {
    let received: ActionContext | undefined;
    class CaptureHandler extends BaseActionHandler {
      async handle(ctx: ActionContext): Promise<void> { received = ctx; }
    }
    const ctx = makeCtx({ name: 'myAction', params: ['a', 'b'] });
    await new CaptureHandler().handle(ctx);
    expect(received?.name).toBe('myAction');
    expect(received?.params).toEqual(['a', 'b']);
  });
});
