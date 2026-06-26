/**
 * BaseGuard — abstract base class for route guards.
 *
 * Provides typed helpers so implementations never have to construct
 * GuardResult literals by hand.
 *
 * @example
 * class AdminGuard extends BaseGuard {
 *   async canActivate(ctx: NavigationContext): Promise<GuardResult> {
 *     return ctx.data['role'] === 'admin' ? this.allow() : this.redirect('/forbidden');
 *   }
 * }
 */

import type { NavigationContext } from '../interfaces/navigation.js';
import type { Guard, GuardResult } from '../interfaces/guard.js';

export abstract class BaseGuard implements Guard {
  abstract canActivate(ctx: NavigationContext): Promise<GuardResult>;

  protected allow(): GuardResult {
    return { allowed: true };
  }

  protected deny(message?: string): GuardResult {
    return message !== undefined ? { allowed: false, message } : { allowed: false };
  }

  protected redirect(path: string): GuardResult {
    return { allowed: false, redirect: path };
  }
}
