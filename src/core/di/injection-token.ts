/**
 * InjectionToken<T> — a type-safe key for the DI container.
 *
 * The generic parameter T is a phantom type: it exists only for TypeScript
 * inference and carries no runtime value. This lets `Injector.get(token)`
 * return `T` without any explicit casts at the call site.
 *
 * @example
 * const EVENT_SERVICE = new InjectionToken<EventService>('EventService');
 * injector.bind(EVENT_SERVICE, new EventServiceImpl());
 * const svc = injector.get(EVENT_SERVICE); // typed as EventService
 */
export class InjectionToken<T> {
  // Phantom type holder — no runtime slot emitted; satisfies noUnusedLocals for T.
  declare protected readonly _type: T;

  constructor(readonly description: string) {}

  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}

/** Extracts the value type from an InjectionToken. */
export type TokenType<Token extends InjectionToken<unknown>> =
  Token extends InjectionToken<infer T> ? T : never;
