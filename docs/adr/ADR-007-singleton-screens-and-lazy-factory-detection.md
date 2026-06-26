# ADR-007: Singleton Screens and Lazy Factory Detection via Prototype Absence

## Status
Accepted

## Context

### Singleton screens

Most screens are stateless: they derive everything from `NavigationContext` and hold no instance state. Instantiating a fresh object on every render is correct for stateful screens but wasteful for stateless ones. Two approaches:

1. **Registry-level config**: `register({ path, component, singleton: true })`. The singleton flag lives with the route, not the screen.
2. **Class-level static field**: `static readonly singleton = true`. The screen declares its own lifecycle intent. The registry inspects this field.

### Lazy route loading

Some screens are heavyweight: they import large dependencies or are rarely visited. Loading every screen at startup increases memory usage and startup time. The solution is lazy route loading:

```typescript
// Eager: HomeScreen is imported and registered immediately
engine.register({ path: '/', component: HomeScreen });

// Lazy: factory is called the first time the route is navigated to
engine.register({ path: '/heavy', component: () => HeavyScreen });
```

The registry must distinguish a `ScreenComponentConstructor` (a class) from a `LazyComponentFactory` (an arrow function returning a class). TypeScript's type system can represent this, but at runtime both are `Function`. A detection mechanism is needed.

## Decision

### Singleton: `static readonly singleton = true` on the class

```typescript
class DashboardScreen implements ScreenComponent {
  static readonly singleton = true as const;
  // ...
}
```

`ScreenRegistry.createScreen()` checks `Ctor.singleton` after resolving the constructor. If true, it returns an existing cached instance (creating it on first call); otherwise it calls `new Ctor()`.

**Why class-level, not route-level:** The singleton property is a characteristic of the screen's implementation (it has no mutable state), not of a particular route. A screen could in principle be registered on multiple routes and should behave as a singleton on all of them.

### Lazy factory detection: `typeof component.prototype === 'undefined'`

In JavaScript/TypeScript:
- **Classes** (`class Foo {}`) always have a `prototype` property (an object).
- **Arrow functions** (`() => Foo`) do **not** have a `prototype` property (it is `undefined`).
- **Regular functions** (`function() {}`) do have a `prototype`. They are not a valid `LazyComponentFactory` and the type system excludes them.

```typescript
function isLazyFactory(
  component: ScreenComponentConstructor | LazyComponentFactory,
): component is LazyComponentFactory {
  return typeof (component as { prototype?: unknown }).prototype === 'undefined';
}
```

On first access, `ScreenRegistry.getConstructor()` calls the factory, caches the result in `resolvedMap`, and returns the constructor. Subsequent calls return the cached constructor without invoking the factory again.

## Consequences

**Positive**
- Singleton screens require zero changes to route registration code — the screen self-declares its lifecycle.
- Lazy factories are detected without a registry flag or a wrapper type. Bot authors write idiomatic arrow functions.
- The factory is called exactly once per path (result is cached), so even if `import()` is used inside, the import cost is paid only once.

**Negative**
- The `prototype` detection trick relies on a JavaScript runtime invariant (arrow functions have no prototype). This is guaranteed by the ECMAScript spec and stable, but it is not self-evident to a reader unfamiliar with the trick. The `isLazyFactory` helper must be kept alongside a comment or this ADR for clarity.
- `static readonly singleton = true` requires TypeScript's `as const` to narrow the type to `true` rather than `boolean`. Without `as const`, the type checker cannot guarantee the field satisfies `singleton?: true` (an optional literal type). This is a minor footgun for screen authors.
