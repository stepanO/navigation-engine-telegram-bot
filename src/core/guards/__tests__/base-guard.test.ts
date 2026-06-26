import { BaseGuard } from '../base-guard.js';
import type { NavigationContext } from '../../interfaces/navigation.js';
import type { GuardResult } from '../../interfaces/guard.js';

// Concrete subclass that exposes the protected helpers for testing
class TestGuard extends BaseGuard {
  private outcome: 'allow' | 'deny' | 'redirect' = 'allow';
  private denyMessage: string | undefined;
  private redirectPath: string | undefined;

  setAllow(): void { this.outcome = 'allow'; }
  setDeny(message?: string): void { this.outcome = 'deny'; this.denyMessage = message; }
  setRedirect(path: string): void { this.outcome = 'redirect'; this.redirectPath = path; }

  async canActivate(_ctx: NavigationContext): Promise<GuardResult> {
    if (this.outcome === 'allow') return this.allow();
    if (this.outcome === 'deny') return this.deny(this.denyMessage);
    return this.redirect(this.redirectPath!);
  }
}

const fakeCtx = {} as NavigationContext;

describe('BaseGuard', () => {
  describe('allow()', () => {
    it('returns { allowed: true }', async () => {
      const guard = new TestGuard();
      guard.setAllow();
      const result = await guard.canActivate(fakeCtx);
      expect(result).toEqual({ allowed: true });
    });
  });

  describe('deny()', () => {
    it('returns { allowed: false } with no message', async () => {
      const guard = new TestGuard();
      guard.setDeny();
      const result = await guard.canActivate(fakeCtx);
      expect(result.allowed).toBe(false);
      expect('redirect' in result && result.redirect).toBeFalsy();
    });

    it('returns { allowed: false, message } when message provided', async () => {
      const guard = new TestGuard();
      guard.setDeny('Access denied');
      const result = await guard.canActivate(fakeCtx);
      expect(result.allowed).toBe(false);
      // Cast to the deny-with-message branch to access .message
      expect((result as { allowed: false; message?: string }).message).toBe('Access denied');
    });
  });

  describe('redirect()', () => {
    it('returns { allowed: false, redirect: path }', async () => {
      const guard = new TestGuard();
      guard.setRedirect('/login');
      const result = await guard.canActivate(fakeCtx);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.redirect).toBe('/login');
      }
    });
  });
});
