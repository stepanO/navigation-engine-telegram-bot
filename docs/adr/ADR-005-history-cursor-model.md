# ADR-005: History Cursor Model (entries[] + cursor index)

## Status
Accepted

## Context

The navigation history needs to support:
- `navigate(path)` — push a new entry, discard any forward history
- `back()` — go to the previous entry
- `replace(path)` — replace the current entry without adding to history

Two obvious representations:

1. **Simple stack** (`HistoryEntry[]` + pop/push). `back()` pops; `navigate()` pushes. Clean and minimal. However, `replace()` must mutate the top, and there is no way to discard forward entries on navigate because there are no forward entries — once popped, they are gone.

2. **Cursor model** (`entries: HistoryEntry[]` + `cursor: number`). The array is the full history including forward entries; the cursor points to the current position. `navigate()` truncates the array at `cursor + 1` then appends. `back()` decrements the cursor. `replace()` overwrites `entries[cursor]`. Directly mirrors the browser's `history` API.

## Decision

Use the cursor model.

```typescript
interface NavigationState {
  entries: HistoryEntry[];
  cursor:  number;
}
```

- `navigate(path)`: truncate `entries` to `cursor + 1`, push new entry, increment cursor.
- `back()`: throw `NoHistoryError` if `cursor === 0`; otherwise decrement cursor and re-render `entries[cursor - 1]`.
- `replace(path)`: overwrite `entries[cursor]` in-place; cursor unchanged.
- `maxHistoryEntries` (default 50) caps the array length. When exceeded, the oldest entry is shifted off and cursor decremented.

## Consequences

**Positive**
- `replace()` is a first-class operation with no special-casing.
- The model matches browser `window.history` exactly, making it immediately legible to web developers.
- Forward history is preserved across a `back()` call until a `navigate()` discards it — consistent with every major browser.
- Serialisation to JSON is trivial: one array, one integer.

**Negative**
- For bots that only ever go forward, the cursor is always equal to `entries.length - 1` and the array could be a simple stack. The extra integer is a negligible overhead.
- The cursor must always be a valid index (`0 ≤ cursor < entries.length`). Persisted state loaded from a store could be corrupt if entries were manually modified. `NavigationStack` validates this on load but does not yet auto-repair.
