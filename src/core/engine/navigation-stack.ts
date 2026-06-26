/**
 * NavigationStack — manages the history of navigation entries for one user/chat.
 *
 * History model:
 *   entries[] is an append-only log.
 *   cursor points to the "current" entry.
 *   back()    decrements cursor (does not pop — forward() can re-advance).
 *   navigate() pushes after cursor, discarding any forward entries (same as browser history).
 *   replace()  overwrites the entry at cursor.
 *   reset()    clears history and starts fresh at the given path.
 *
 * Maximum history size is configurable to avoid unbounded memory growth.
 *
 * messageId is carried as an opaque pass-through: the engine reads it from
 * persisted state and writes it back after render. The stack itself does not
 * interpret it.
 */

import type { HistoryEntry, NavigationState } from '../interfaces/navigation.js';
import type { RouteMatch } from '../interfaces/route.js';
import { NoHistoryError } from '../interfaces/errors.js';

const DEFAULT_MAX_HISTORY = 50;

export class NavigationStack {
  private entries: HistoryEntry[];
  private cursor: number;
  private messageId: number | undefined;

  constructor(
    private readonly chatId: number,
    private readonly userId: number,
    private readonly maxHistory = DEFAULT_MAX_HISTORY,
    initialState?: NavigationState,
  ) {
    if (initialState) {
      this.entries = [...initialState.entries];
      this.cursor = initialState.cursor;
      this.messageId = initialState.messageId;
    } else {
      this.entries = [];
      this.cursor = -1;
      this.messageId = undefined;
    }
  }

  /** Push a new entry. Discards any forward history beyond the current cursor. */
  push(match: RouteMatch): void {
    const entry = this.matchToEntry(match);

    // Truncate forward history.
    this.entries = this.entries.slice(0, this.cursor + 1);
    this.entries.push(entry);

    // Enforce max size by dropping oldest entries.
    if (this.entries.length > this.maxHistory) {
      const excess = this.entries.length - this.maxHistory;
      this.entries = this.entries.slice(excess);
    }

    this.cursor = this.entries.length - 1;
  }

  /** Replace the current entry in place. Does not change history length. */
  replace(match: RouteMatch): void {
    if (this.cursor < 0) {
      // Nothing to replace — treat as push.
      this.push(match);
      return;
    }
    this.entries[this.cursor] = this.matchToEntry(match);
  }

  /**
   * Move cursor back one step.
   * @throws NoHistoryError if already at the start of history.
   */
  back(): HistoryEntry {
    if (this.cursor <= 0) {
      throw new NoHistoryError();
    }
    this.cursor--;
    const entry = this.entries[this.cursor];
    if (!entry) throw new NoHistoryError();
    return entry;
  }

  /** Current entry, or undefined if history is empty. */
  current(): HistoryEntry | undefined {
    if (this.cursor < 0) return undefined;
    return this.entries[this.cursor];
  }

  /** Returns true if back() can be called. */
  canGoBack(): boolean {
    return this.cursor > 0;
  }

  /** Clears all history and seeds with the given path. */
  reset(match: RouteMatch): void {
    this.entries = [this.matchToEntry(match)];
    this.cursor = 0;
  }

  /** Store the Telegram message ID of the bot's active navigation message. */
  updateMessageId(id: number): void {
    this.messageId = id;
  }

  /** The persisted message ID, or undefined if not yet known. */
  getMessageId(): number | undefined {
    return this.messageId;
  }

  /** Serializes state for persistence. */
  toState(): NavigationState {
    const base: NavigationState = {
      chatId: this.chatId,
      userId: this.userId,
      cursor: this.cursor,
      entries: this.entries,
    };
    return this.messageId !== undefined ? { ...base, messageId: this.messageId } : base;
  }

  private matchToEntry(match: RouteMatch): HistoryEntry {
    return {
      path: match.fullPath,
      params: match.params,
      query: match.query,
      timestamp: Date.now(),
    };
  }
}
