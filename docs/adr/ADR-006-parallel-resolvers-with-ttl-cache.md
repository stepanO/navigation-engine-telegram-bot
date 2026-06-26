# ADR-006: Parallel Resolver Execution with Per-User TTL Cache

## Status
Accepted

## Context

A route can declare multiple resolvers that fetch async data before the screen renders:

```typescript
engine.register({
  path: '/events/:id',
  component: EventDetailScreen,
  resolvers: { event: EventResolver, organizer: OrganizerResolver },
});
```

Two execution strategies were considered:

1. **Sequential.** Each resolver awaits the previous. Simple error attribution (which resolver failed is always clear). Total latency = sum of individual latencies.

2. **Parallel.** All resolvers run concurrently via `Promise.all`. Total latency ≈ slowest resolver. More complex error attribution (all errors thrown simultaneously).

A secondary question: should resolver results be cached? Navigating away and back to `/events/42` should not re-fetch the same event from the database unless the data has changed.

## Decision

**Execution: parallel.**

`NavigationEngine.runResolvers()` calls `Promise.all(resolverEntries.map(…))`. Each resolver's result is keyed by its map key (`event`, `organizer`, etc.) and merged into `ctx.data`.

A `ResolverError` wraps the first rejection with the resolver's constructor name so the caller can identify which resolver failed even in parallel mode.

**Caching: opt-in TTL cache, keyed per user/chat/route/params.**

Resolvers declare `static cacheTtl: number` (milliseconds) to opt in:

```typescript
class EventResolver implements Resolver<Event> {
  static readonly cacheTtl = 60_000; // 1 minute

  async resolve(ctx: NavigationContext): Promise<Event> {
    return db.events.findById(ctx.params['id']!);
  }
}
```

Cache key: `${chatId}:${userId}:${routePath}:${resolverName}:${JSON.stringify(params)}`.

The cache lives in `NavigationEngine` (in-memory, no TTL background pruning). A cache miss runs the resolver and stores the result with an expiry timestamp. A hit returns the cached value without calling `resolve()`.

## Consequences

**Positive**
- Parallel execution minimises total resolver latency at zero extra configuration.
- TTL cache eliminates redundant DB/API round-trips on back navigation.
- Cache opt-in is zero-configuration: add `static cacheTtl` and it works.

**Negative**
- Parallel errors: when two resolvers fail simultaneously, only the first rejection is surfaced by `Promise.all`. The second error is silently dropped. This is acceptable in practice — the user will retry, and the root cause is visible in the first error.
- The in-memory resolver cache does not survive process restarts. For production deployments with multiple instances, each instance maintains its own cache, leading to redundant fetches across instances. A distributed cache adapter is a future extension point.
- `JSON.stringify(params)` for the cache key is non-deterministic for objects with differing key order. Route params come from RegExp named groups so their order is stable, but future changes to how params are built must preserve that stability.
