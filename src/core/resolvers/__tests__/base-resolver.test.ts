import { BaseResolver } from '../base-resolver.js';
import type { NavigationContext } from '../../interfaces/navigation.js';

class NumberResolver extends BaseResolver<number> {
  async resolve(_ctx: NavigationContext): Promise<number> {
    return 42;
  }
}

class ContextParamResolver extends BaseResolver<string> {
  async resolve(ctx: NavigationContext): Promise<string> {
    return ctx.params['id'] ?? 'none';
  }
}

const fakeCtx = (params: Record<string, string> = {}) =>
  ({ params, data: {}, query: {} } as unknown as NavigationContext);

describe('BaseResolver', () => {
  it('can be extended to return a primitive value', async () => {
    const resolver = new NumberResolver();
    expect(await resolver.resolve(fakeCtx())).toBe(42);
  });

  it('receives NavigationContext and can read params', async () => {
    const resolver = new ContextParamResolver();
    expect(await resolver.resolve(fakeCtx({ id: '99' }))).toBe('99');
  });

  it('returns default when param is absent', async () => {
    const resolver = new ContextParamResolver();
    expect(await resolver.resolve(fakeCtx())).toBe('none');
  });
});
