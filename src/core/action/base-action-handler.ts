/**
 * BaseActionHandler — abstract base class for action handlers.
 *
 * Extend this to implement action-specific side effects.
 * Call ctx.navigate() / ctx.replace() / ctx.back() inside handle()
 * to trigger navigation after the action completes.
 *
 * @example
 * class DeleteParticipantHandler extends BaseActionHandler {
 *   async handle(ctx: ActionContext): Promise<void> {
 *     const participantId = ctx.params[0];
 *     await participantService.delete(participantId);
 *     await ctx.replace('/participants');
 *   }
 * }
 */

import type { ActionContext, ActionHandler } from './action-context.js';

export abstract class BaseActionHandler implements ActionHandler {
  abstract handle(ctx: ActionContext): Promise<void>;
}
