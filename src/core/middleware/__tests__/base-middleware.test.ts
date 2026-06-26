import { BaseMiddleware } from '../base-middleware.js';
import type { NavigationContext } from '../../interfaces/navigation.js';
import type { NextFn } from '../../interfaces/middleware.js';

class PassthroughMiddleware extends BaseMiddleware {
  called = false;
  async handle(_ctx: NavigationContext, next: NextFn): Promise<void> {
    this.called = true;
    await next();
  }
}

class BlockingMiddleware extends BaseMiddleware {
  async handle(_ctx: NavigationContext, _next: NextFn): Promise<void> {
    // intentionally omits next() to short-circuit the chain
  }
}

class BeforeAfterMiddleware extends BaseMiddleware {
  readonly log: string[] = [];
  async handle(_ctx: NavigationContext, next: NextFn): Promise<void> {
    this.log.push('before');
    await next();
    this.log.push('after');
  }
}

const fakeCtx = {} as NavigationContext;

describe('BaseMiddleware', () => {
  it('calls next() when implementation forwards', async () => {
    let nextCalled = false;
    const mw = new PassthroughMiddleware();
    await mw.handle(fakeCtx, async () => { nextCalled = true; });
    expect(mw.called).toBe(true);
    expect(nextCalled).toBe(true);
  });

  it('short-circuits when implementation omits next()', async () => {
    let nextCalled = false;
    const mw = new BlockingMiddleware();
    await mw.handle(fakeCtx, async () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
  });

  it('supports before/after pattern', async () => {
    const mw = new BeforeAfterMiddleware();
    let handlerRan = false;
    await mw.handle(fakeCtx, async () => {
      expect(mw.log).toEqual(['before']);
      handlerRan = true;
    });
    expect(handlerRan).toBe(true);
    expect(mw.log).toEqual(['before', 'after']);
  });
});
