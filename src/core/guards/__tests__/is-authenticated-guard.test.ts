import { IsAuthenticatedGuard } from '../is-authenticated-guard.js';
import type { NavigationContext } from '../../interfaces/navigation.js';

function makeCtx(data: Record<string, unknown>): NavigationContext {
  return { data } as unknown as NavigationContext;
}

describe('IsAuthenticatedGuard', () => {
  it('allows navigation when session with userId is present', async () => {
    const guard = new IsAuthenticatedGuard();
    const result = await guard.canActivate(makeCtx({ session: { userId: 42 } }));
    expect(result.allowed).toBe(true);
  });

  it('redirects to /login when no session in ctx.data', async () => {
    const guard = new IsAuthenticatedGuard();
    const result = await guard.canActivate(makeCtx({}));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.redirect).toBe('/login');
  });

  it('redirects to /login when session is undefined', async () => {
    const guard = new IsAuthenticatedGuard();
    const result = await guard.canActivate(makeCtx({ session: undefined }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.redirect).toBe('/login');
  });

  it('redirects when session exists but userId is missing', async () => {
    const guard = new IsAuthenticatedGuard();
    const result = await guard.canActivate(makeCtx({ session: {} }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.redirect).toBe('/login');
  });

  it('can be subclassed to change the login path', async () => {
    class CustomGuard extends IsAuthenticatedGuard {
      protected override readonly loginPath = '/auth/sign-in';
    }
    const guard = new CustomGuard();
    const result = await guard.canActivate(makeCtx({}));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.redirect).toBe('/auth/sign-in');
  });
});
