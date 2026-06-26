# ADR-003: Three-Tier Callback Encoder Strategy

## Status
Accepted

## Context

Telegram's `callback_data` field is hard-limited to **64 bytes** (UTF-8). Navigation paths must be encoded into this field so the bot knows where to go when a button is pressed. Three strategies exist, each with a different byte budget vs. infrastructure trade-off:

| Strategy | Byte usage | Infrastructure | Debuggability |
|----------|-----------|----------------|---------------|
| Inline full path | Path length + prefix | None | Human-readable |
| Route ID + params | ~10–30 bytes typically | Route registry | Moderate |
| Server key only | Fixed 8 bytes | Key-value store | Opaque key |

A fourth option — silently truncating long paths — was explicitly rejected because it produces corrupt navigation silently. Errors must be loud.

## Decision

Ship all three strategies as interchangeable `CallbackDataEncoder` implementations. Bot authors pick the encoder that matches their constraints:

### `SimpleCallbackEncoder` (default)
Encodes the full path inline: `nav:/events/42?page=1`. Validates byte length on every call and throws `CallbackDataTooLongError` rather than truncating. Best for bots with short, stable paths.

### `CompactCallbackEncoder`
Assigns each registered route a 2-character base-36 ID (supports up to 1 296 routes). Callback data is `c:{id}:{param1}:{param2}:...:{k=v}`. Byte usage depends on param values, not path verbosity. Best for bots with long route templates but short runtime values.

Auto-registration: `GrammYNavigationEngine` duck-type checks `'registerRoute' in encoder` and calls it for each registered route, keeping registration transparent.

### `ServerStateEncoder`
Stores the full path server-side (any `CallbackStore` implementation) and emits only an 8-byte counter key (`s:{6-char-base36}`). Unlimited path length; adds one store lookup per button press. Best when paths are long or dynamic, and a Redis/in-process store is acceptable.

The `CallbackDataEncoder` interface is the only coupling point. `KeyboardBuilder`, `Button`, and the grammY adapter depend on the interface, not on any specific implementation.

## Consequences

**Positive**
- Bot authors choose the right trade-off for their deployment without changing screen or keyboard code.
- `SimpleCallbackEncoder` is zero-dependency and zero-latency — a good default.
- `ServerStateEncoder` eliminates the byte budget problem entirely for complex bots.
- All three share the same `decode()` contract so the adapter dispatch loop is unchanged.

**Negative**
- `CompactCallbackEncoder` requires stable route IDs across deployments. If a route is removed and IDs are reassigned, old `callback_data` values in existing Telegram messages will decode to the wrong route. Teams must treat route order as append-only (or re-assign IDs explicitly).
- `ServerStateEncoder`'s `InMemoryCallbackStore` is lost on restart. Production use requires a Redis or DB-backed store.
- Three encoders means three code paths to maintain and test.
