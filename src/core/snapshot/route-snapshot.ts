/**
 * RouteSnapshot — the minimal serializable state needed to reconstruct a screen.
 *
 * ## Key space: (chatId, messageId)
 *
 * Snapshots are keyed by (chatId, messageId), not by (chatId, userId) like
 * NavigationState. This is intentional:
 *
 *   - A Telegram message is the unit of navigation rendering. Buttons belong
 *     to a specific message, not to a user session. In group chats multiple
 *     users may interact with the same navigation message.
 *
 *   - After a bot restart, callback_query.message.message_id is always
 *     available from the Telegram update. This lets us recover the route
 *     without any per-user session state in the StateStore.
 *
 *   - NavigationState (keyed by userId:chatId) manages the navigation stack
 *     and history cursor. RouteSnapshot (keyed by chatId:messageId) manages
 *     the rendered content of a specific message. The two concerns are
 *     orthogonal and must not be conflated.
 *
 * ## Serialization contract
 *
 * RouteSnapshot contains only JSON-serializable primitives: numbers, strings,
 * Date (as ISO string in transit). No screen instances, no closures, no
 * runtime references. Any persistence backend (Redis, Postgres, SQLite,
 * Firestore) can store a snapshot by serializing to/from JSON without
 * additional type mapping.
 *
 * ## Relationship to WizardSnapshotStore (future)
 *
 * WizardSnapshotStore is a future sibling concept that will persist wizard
 * step state. It must remain a completely separate interface with its own
 * key space (e.g. wizardId:chatId:userId). Navigation recovery must never
 * touch wizard state and wizard resume must never touch route snapshots.
 *
 * @see RouteSnapshotStore for the persistence interface.
 * @see InMemoryRouteSnapshotStore for the reference implementation.
 */

import type { RouteParams, QueryParams } from '../interfaces/route.js';

/**
 * Minimal serializable representation of a rendered navigation screen.
 *
 * Written once per successful render; read during callback recovery when
 * the encoder cannot decode the callback data (e.g. after a bot restart
 * when using ServerStateEncoder).
 */
export interface RouteSnapshot {
  /** The Telegram message ID of the rendered navigation message. Part of the lookup key. */
  readonly messageId: number;

  /** The Telegram chat ID. Part of the lookup key. */
  readonly chatId: number;

  /**
   * The concrete navigated path, e.g. "/users/42?tab=settings".
   *
   * This is the exact string passed to NavigationEngine.navigate() that
   * produced this render. Recovery calls engine.navigate(snapshot.route, ...)
   * which re-runs the full lifecycle (guards → resolvers → render → new snapshot).
   *
   * Using the concrete path (not the route pattern) means the router re-extracts
   * params naturally. No separate param reconstruction is needed.
   */
  readonly route: string;

  /**
   * Named params extracted from the path pattern, e.g. { id: "42" }.
   * Mirrored from RouteMatch.params at render time.
   *
   * Stored alongside `route` for:
   *   - Analytics queries without URL re-parsing.
   *   - Future migration handlers that need to inspect specific param values
   *     before deciding whether to recover or reject a stale snapshot.
   */
  readonly params: RouteParams;

  /**
   * Query string params, e.g. { tab: "settings", page: "2" }.
   * Mirrored from RouteMatch.query at render time.
   * See `params` for rationale.
   */
  readonly query: QueryParams;

  /**
   * Schema version of the screen at render time.
   * Populated from RouteDefinition.version; defaults to 1 when unspecified.
   *
   * ## Future migration use
   *
   * When recovering from a snapshot, compare snapshot.screenVersion against
   * the current RouteDefinition.version. If they differ, the screen's data
   * contract or layout may have changed since the message was originally rendered.
   *
   * At that point a migration handler could:
   *   - Re-render transparently with the new schema (user sees nothing).
   *   - Prompt the user ("this message is outdated, tap to refresh").
   *   - Reject the recovery and treat the snapshot as stale.
   *
   * Migrations are NOT implemented here. This field only stores the version
   * so the infrastructure exists when migrations are needed.
   *
   * Version 1 is the sentinel for "versioning was active when this was rendered".
   * Version 0 can be reserved for snapshots created before the version field
   * existed (i.e. from a downgrade scenario).
   */
  readonly screenVersion: number;

  /**
   * When this snapshot was last written (created or updated).
   * ISO-serializable — persistence adapters can store as ISO string and
   * rehydrate with `new Date(stored)`.
   */
  readonly renderedAt: Date;
}

/**
 * RouteSnapshotStore — persistence interface for route snapshots.
 *
 * ## Implementations
 *
 * - InMemoryRouteSnapshotStore  bundled, suitable for tests and dev
 * - RedisRouteSnapshotStore     production (implement in consuming app)
 * - PostgresRouteSnapshotStore  production (implement in consuming app)
 *
 * ## save() vs update()
 *
 * save() is an upsert. The NavigationEngine always calls save() after a
 * successful render. Making it an upsert keeps the render path unconditional:
 * no "does this snapshot exist?" read before every write.
 *
 * update() is a guarded write. It throws SnapshotNotFoundError when the key
 * is absent, making intent explicit — update() means "I know this exists, I
 * am changing it." Use it when you need that strict contract (e.g. marking a
 * snapshot as "migrated" after a version bump without accidentally creating
 * a ghost entry).
 *
 * ## Thread safety
 *
 * Implementations must be safe under concurrent async access. For Redis or
 * Postgres adapters this comes for free. For the in-memory implementation
 * it holds because JavaScript is single-threaded.
 */
export interface RouteSnapshotStore {
  /**
   * Persist a snapshot. Upserts — creates or replaces the entry keyed by
   * (chatId, messageId). Called automatically after every successful render
   * when a snapshotStore is configured.
   */
  save(snapshot: RouteSnapshot): Promise<void>;

  /**
   * Find a snapshot by its Telegram coordinates.
   * Returns null when no snapshot exists for (chatId, messageId).
   * Never throws on a missing key.
   */
  find(chatId: number, messageId: number): Promise<RouteSnapshot | null>;

  /**
   * Remove the snapshot for (chatId, messageId).
   * No-op when the key does not exist (idempotent).
   * Call this when the Telegram message is deleted to keep the store lean.
   */
  delete(chatId: number, messageId: number): Promise<void>;

  /**
   * Update an existing snapshot in place.
   * Throws SnapshotNotFoundError when no snapshot exists for (chatId, messageId).
   *
   * Use save() for create-or-replace semantics.
   * Use update() when strict existence is required.
   */
  update(snapshot: RouteSnapshot): Promise<void>;
}
