/**
 * ActionDispatcher — registry and dispatcher for action handlers.
 *
 * Usage:
 *   const dispatcher = new ActionDispatcher();
 *   dispatcher.register('deleteEvent', DeleteEventHandler);
 *   dispatcher.register('archiveEvent', ArchiveEventHandler);
 *
 *   // The GrammYAdapter (or GrammYNavigationEngine) calls:
 *   await dispatcher.dispatch(actionContext);
 */

import type { ActionContext, ActionHandlerConstructor } from './action-context.js';
import { ActionNotFoundError, DuplicateActionError } from '../interfaces/errors.js';

export class ActionDispatcher {
  private readonly handlers = new Map<string, ActionHandlerConstructor>();

  /**
   * Register an action handler class for the given action name.
   * Throws `DuplicateActionError` if the name is already registered.
   * Returns `this` for fluent chaining.
   */
  register(name: string, handler: ActionHandlerConstructor): this {
    if (this.handlers.has(name)) {
      throw new DuplicateActionError(name);
    }
    this.handlers.set(name, handler);
    return this;
  }

  /**
   * Dispatch an action to its registered handler.
   * Throws `ActionNotFoundError` if no handler is registered for `ctx.name`.
   */
  async dispatch(ctx: ActionContext): Promise<void> {
    const Ctor = this.handlers.get(ctx.name);
    if (!Ctor) {
      throw new ActionNotFoundError(ctx.name);
    }
    const handler = new Ctor();
    await handler.handle(ctx);
  }

  /** Returns true if a handler is registered for the given name. */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /** Number of registered action handlers. */
  get size(): number {
    return this.handlers.size;
  }
}
