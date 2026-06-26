# ADR-002: First-Match RegExp Routing (Express-Style)

## Status
Accepted

## Context

The router must map a navigation path like `/events/42` to a registered route definition like `/events/:id`. Three common strategies were considered:

1. **Exact-match only.** Fast, zero ambiguity, but prevents parameterised paths like `:id` or wildcard catch-alls.

2. **Scoring / best-match.** Routes compete; the most specific wins (e.g., `/events/new` beats `/events/:id`). Eliminates registration order as a footgun but adds complexity — scoring rules must be defined and tested.

3. **First-match, registration-order wins (Express-style).** Routes are matched in the order they are registered. The first route whose compiled RegExp matches the path wins. Predictable, simple, familiar to most backend developers.

## Decision

Use first-match, registration-order routing.

- `compileRoute(path)` converts `:param` segments to named capture groups and wraps the result in `^…$` anchors.
- `Router.match(path)` iterates registered routes in insertion order and returns the first match.
- If no route matches, `RouteNotFoundError` is thrown.

**Consequence of this choice:** callers must register specific routes before catch-alls:

```typescript
engine.register({ path: '/events/new', component: CreateEventScreen }); // specific first
engine.register({ path: '/events/:id', component: EventDetailScreen }); // param second
engine.register({ path: '/*', component: NotFoundScreen });              // wildcard last
```

## Consequences

**Positive**
- Zero configuration: registration order is the only rule to learn.
- Identical mental model to Express.js and Angular's `Routes` array — familiar to the target audience.
- Implementation is ~30 lines (see `route-matcher.ts`).

**Negative**
- Registration order is a footgun: registering `/events/:id` before `/events/new` silently shadows the specific route. The project relies on documentation and convention rather than a runtime guard to prevent this.
- No built-in support for route priorities or weights.
