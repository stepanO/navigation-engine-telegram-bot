/**
 * IsAuthenticatedGuard — example guard that blocks unauthenticated navigation.
 *
 * Reads `ctx.data['session']` populated by an auth middleware.
 * Redirects to `/login` when no valid session is found.
 *
 * @example
 * // In your engine setup:
 * engine.use(SessionMiddleware);   // populates ctx.data['session']
 * engine.register({
 *   path: '/dashboard',
 *   component: DashboardScreen,
 *   guards: [IsAuthenticatedGuard],
 * });
 */

import type { NavigationContext } from '../interfaces/navigation.js';
import type { GuardResult } from '../interfaces/guard.js';
import { BaseGuard } from './base-guard.js';

/** Minimal session shape the guard expects in ctx.data['session']. */
export interface Session {
  readonly userId: number;
}

export class IsAuthenticatedGuard extends BaseGuard {
  /** Override to change the redirect target for unauthenticated users. */
  protected readonly loginPath: string = '/login';

  async canActivate(ctx: NavigationContext): Promise<GuardResult> {
    const session = ctx.data['session'] as Session | undefined;
    if (session?.userId !== undefined) {
      return this.allow();
    }
    return this.redirect(this.loginPath);
  }
}
