# ADR-001: SPA-Style In-Place Message Editing

## Status
Accepted

## Context

Telegram bots conventionally send a new message in response to every user action. This creates a growing chat history of duplicate or outdated content that the user must scroll through, and it prevents any illusion of a persistent "app screen."

Two alternatives were considered:

1. **Send a new message on every interaction.** Simple to implement; no need to track a message ID. However, the chat fills with stale messages, navigation state is hard to reconstruct, and the UX feels like a form submission loop rather than an app.

2. **Edit the existing message in-place (SPA model).** One message acts as the "viewport." On every navigation event the bot edits that message's text and keyboard. The user sees a smooth screen transition with no chat clutter.

## Decision

Adopt the SPA model: a single Telegram message is edited in-place for every navigation event.

- `RenderTarget` carries an optional `messageId`. When present, `GrammYRenderer` calls `editMessageText` instead of `sendMessage`.
- `NavigationStack` stores `messageId` per history entry so that going back restores the correct message.
- When no `messageId` is available (first interaction or the message was deleted), the renderer falls back to `sendMessage` and stores the new `messageId`.
- Keyboard diffing (Phase 9) skips the Telegram API call entirely when the view fingerprint has not changed, preventing the "message is not modified" API error without extra branching in screen code.

## Consequences

**Positive**
- Users experience a persistent, uncluttered "app screen."
- Navigation history maps 1-to-1 with what the user sees.
- Keyboard diffing becomes a natural optimization: skip the API call unless something changed.

**Negative**
- `messageId` must be tracked and persisted. If a user manually deletes the bot message, the next navigation falls back to sending a new one, which interrupts continuity.
- Telegram enforces a rate limit on `editMessageText`; extremely rapid navigation (not a real-world case for typical bots) can hit it.
- The bot cannot edit messages older than 48 hours (Telegram API restriction). After that window, the fallback `sendMessage` path kicks in automatically.
