/**
 * Typed error classes for navigation failures.
 *
 * The engine catches these and routes to the appropriate error screen.
 * All errors extend NavigationError for easy instanceof checks.
 */

export class NavigationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NavigationError';
  }
}

/** No registered route matches the requested path. */
export class RouteNotFoundError extends NavigationError {
  constructor(public readonly path: string) {
    super(`No route found for path: ${path}`);
    this.name = 'RouteNotFoundError';
  }
}

/** A guard rejected the navigation. */
export class NavigationGuardError extends NavigationError {
  constructor(
    public readonly path: string,
    public readonly message: string,
  ) {
    super(`Guard rejected navigation to ${path}: ${message}`);
    this.name = 'NavigationGuardError';
  }
}

/** A resolver threw during data loading. */
export class ResolverError extends NavigationError {
  constructor(
    public readonly resolverKey: string,
    public readonly cause: unknown,
  ) {
    super(`Resolver "${resolverKey}" failed: ${String(cause)}`);
    this.name = 'ResolverError';
  }
}

/** back() was called but there is no previous history entry. */
export class NoHistoryError extends NavigationError {
  constructor() {
    super('Cannot navigate back: history stack is empty');
    this.name = 'NoHistoryError';
  }
}

/** A route was registered with a path that conflicts with an existing registration. */
export class DuplicateRouteError extends NavigationError {
  constructor(public readonly path: string) {
    super(`Route already registered: ${path}`);
    this.name = 'DuplicateRouteError';
  }
}

/** No action handler is registered for the given action name. */
export class ActionNotFoundError extends NavigationError {
  constructor(public readonly actionName: string) {
    super(`No handler registered for action: "${actionName}"`);
    this.name = 'ActionNotFoundError';
  }
}

/** An action handler was registered with a name that is already taken. */
export class DuplicateActionError extends NavigationError {
  constructor(public readonly actionName: string) {
    super(`Action handler already registered: "${actionName}"`);
    this.name = 'DuplicateActionError';
  }
}

/** No wizard is defined with the given ID. */
export class WizardNotFoundError extends NavigationError {
  constructor(public readonly wizardId: string) {
    super(`No wizard defined with id: "${wizardId}"`);
    this.name = 'WizardNotFoundError';
  }
}

/** nextStep/prevStep/cancel called when no active wizard session exists for this user. */
export class WizardNotActiveError extends NavigationError {
  constructor(public readonly wizardId: string) {
    super(`No active wizard session for wizard: "${wizardId}"`);
    this.name = 'WizardNotActiveError';
  }
}

/** prevStep() called when the wizard is already on the first step. */
export class WizardAtFirstStepError extends NavigationError {
  constructor() {
    super('Cannot go to previous step: already at the first step');
    this.name = 'WizardAtFirstStepError';
  }
}

/** Injector.get() was called for a token that has no registered binding. */
export class InjectionError extends NavigationError {
  constructor(public readonly token: { readonly description: string }) {
    super(`No binding registered for injection token: "${token.description}"`);
    this.name = 'InjectionError';
  }
}

/**
 * Snapshot recovery was attempted but no RouteSnapshot exists for the
 * given (chatId, messageId) pair.
 *
 * Thrown by RouteSnapshotStore.update() when the key is absent (strict update
 * contract). Also available for callers who want to distinguish "no snapshot
 * found" from other navigation errors.
 */
export class SnapshotNotFoundError extends NavigationError {
  constructor(
    public readonly chatId: number,
    public readonly messageId: number,
  ) {
    super(`No route snapshot found for chatId=${chatId}, messageId=${messageId}`);
    this.name = 'SnapshotNotFoundError';
  }
}
