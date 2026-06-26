/**
 * ConcreteNavigationContext — the runtime implementation of NavigationContext.
 *
 * Created by NavigationEngine for each navigation event.
 * Holds a callback to the engine so that navigate/replace/back
 * can trigger a full navigation cycle without exposing the engine itself.
 *
 * Screens receive this as their `ctx` argument but only see the
 * NavigationContext interface — they cannot access the engine internals.
 */

import type { NavigationContext, TelegramUser, TelegramChat } from '../interfaces/navigation.js';
import type { RouteMatch, RouteParams, QueryParams } from '../interfaces/route.js';

export type NavigateFn = (path: string, mode: 'push' | 'replace' | 'back') => Promise<void>;

export class ConcreteNavigationContext<
  TData extends Record<string, unknown> = Record<string, unknown>,
> implements NavigationContext<TData> {
  readonly params: RouteParams;
  readonly query: QueryParams;
  readonly route: RouteMatch;
  readonly user: TelegramUser;
  readonly chat: TelegramChat;
  readonly data: TData;

  constructor(
    route: RouteMatch,
    user: TelegramUser,
    chat: TelegramChat,
    data: TData,
    private readonly navigateFn: NavigateFn,
  ) {
    this.route = route;
    this.params = route.params;
    this.query = route.query;
    this.user = user;
    this.chat = chat;
    this.data = data;
  }

  async navigate(path: string): Promise<void> {
    await this.navigateFn(path, 'push');
  }

  async replace(path: string): Promise<void> {
    await this.navigateFn(path, 'replace');
  }

  async back(): Promise<void> {
    await this.navigateFn('', 'back');
  }
}
