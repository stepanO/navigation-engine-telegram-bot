# ADR-004: Core/Adapter Dependency Inversion (Zero grammY in Core)

## Status
Accepted

## Context

The project sits on top of grammY, but grammY is a Telegram-specific library with a concrete `Context` type, specific update shapes, and Telegram Bot API types. Mixing grammY imports into the core engine would:

- Tie every unit test to grammY's type signatures.
- Make it impossible to port the engine to another bot framework (Telegraf, aiogram Python, etc.) without rewriting the core.
- Force the test suite to mock or fake grammY objects rather than using plain TypeScript objects.

## Decision

`src/core/` contains zero imports from `grammy` or any Telegram API library. The boundary is enforced by convention and TypeScript path aliases — not by a build-time tool, but violations are immediately visible in code review.

**How framework concepts cross the boundary:**

| Concept | Core interface | grammY adapter provides |
|---------|---------------|------------------------|
| "Who is navigating?" | `TelegramUser`, `TelegramChat` (plain objects) | `extractTelegramUser(ctx)`, `extractTelegramChat(ctx)` |
| "Where to render?" | `RenderTarget` (`{ chatId, userId, messageId? }`) | extracted from grammY `Context` |
| "Render a screen" | `Renderer` interface | `GrammYRenderer` calls `bot.api.editMessageText` etc. |
| "What is the result?" | `RenderResult` (`{ messageId? }`) | returned from the grammY API call |

`GrammYNavigationEngine` is the only adapter class that imports grammY. It orchestrates:
1. Mounting the `bot.on('callback_query:data')` listener.
2. Extracting `user`, `chat`, `target` from the grammY `Context`.
3. Calling `NavigationEngine.navigate(path, user, chat, target)`.

## Consequences

**Positive**
- All 490 unit tests in `src/core/` use plain TypeScript objects. No grammY setup, no mock bots.
- A Telegraf or pure Telegram Bot API adapter could be added under `src/adapter/telegraf/` without touching `src/core/`.
- TypeScript strict mode catches any accidental cross-layer import immediately.

**Negative**
- Two layers of types: grammY's `User` and the library's `TelegramUser` hold the same data. The adapter must translate on every update. This is a small, fixed cost.
- Bot authors who are already grammY experts must learn the library's interface types in addition to grammY's, adding a small cognitive overhead.
