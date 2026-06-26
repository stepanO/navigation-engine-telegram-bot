/**
 * Event-manager bot — B2B SaaS demo using GrammYNavigationEngine.
 *
 * Demonstrates:
 *   - SessionMiddleware (in-memory auth)
 *   - AuthGuard  (redirect unauthenticated users to /login)
 *   - EventResolver  (async data fetch before screen renders)
 *   - CompactCallbackEncoder (route IDs keep callback_data short)
 *   - ScreenBuilder + KeyboardBuilder (fluent view construction)
 *   - UI Components  (TitleComponent, StatCardComponent, PaginationComponent)
 *   - Lazy route loading (DashboardScreen loaded only on first visit)
 *   - Singleton screen (EventListScreen shared across all renders)
 *
 * Run:
 *   BOT_TOKEN=<your-token> npx ts-node examples/event-manager/index.ts
 */

import { Bot } from 'grammy';
import {
  GrammYNavigationEngine,
  CompactCallbackEncoder,
  ScreenBuilder,
  Button,
  bold,
  italic,
  TitleComponent,
  StatCardComponent,
  PaginationComponent,
} from '../../src/index.js';
import type {
  ScreenComponent,
  ScreenView,
  NavigationContext,
  Guard,
  GuardResult,
  Resolver,
  NavigationMiddleware,
  NextFn,
} from '../../src/index.js';

// ─── Fake database ───────────────────────────────────────────────────────────

interface Event {
  id: string;
  name: string;
  date: string;
  participants: number;
  capacity: number;
}

const EVENTS: Event[] = [
  { id: '1', name: 'Tech Summit 2026', date: '2026-09-15', participants: 120, capacity: 200 },
  { id: '2', name: 'Design Sprint Workshop', date: '2026-10-01', participants: 24, capacity: 30 },
  { id: '3', name: 'AI/ML Bootcamp', date: '2026-11-05', participants: 60, capacity: 100 },
];

const SESSIONS = new Map<number, { userId: number; name: string }>();

// ─── Middleware ───────────────────────────────────────────────────────────────

class SessionMiddleware implements NavigationMiddleware {
  async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
    const session = SESSIONS.get(ctx.user.id);
    (ctx.data as Record<string, unknown>)['session'] = session;
    await next();
  }
}

// ─── Guards ───────────────────────────────────────────────────────────────────

class AuthGuard implements Guard {
  async canActivate(ctx: NavigationContext): Promise<GuardResult> {
    if (ctx.data['session']) return { allowed: true };
    return { allowed: false, redirect: '/login' };
  }
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

class EventResolver implements Resolver<Event | null> {
  static readonly cacheTtl = 30_000; // 30 s

  async resolve(ctx: NavigationContext): Promise<Event | null> {
    return EVENTS.find(e => e.id === ctx.params['id']) ?? null;
  }
}

// ─── Screens ─────────────────────────────────────────────────────────────────

class LoginScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html(TitleComponent('Event Manager'))
      .html('\nPlease enter your name to continue.')
      .html('\n\nSend: <code>/login YourName</code>')
      .build();
  }
}

class DashboardScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    const session = ctx.data['session'] as { name: string };
    const total = EVENTS.length;
    const totalParticipants = EVENTS.reduce((s, e) => s + e.participants, 0);

    return new ScreenBuilder()
      .html(TitleComponent(`Welcome, ${session.name}!`))
      .html('\n\n')
      .html(StatCardComponent('Total Events', String(total)))
      .html('  ')
      .html(StatCardComponent('Total Participants', String(totalParticipants)))
      .row(Button.navigate('📅 Events', '/events'))
      .row(Button.navigate('⚙️ Settings', '/settings'))
      .build();
  }
}

class EventListScreen implements ScreenComponent {
  static readonly singleton = true as const;

  async render(ctx: NavigationContext): Promise<ScreenView> {
    const page = Number(ctx.query['page'] ?? '1');
    const pageSize = 2;
    const start = (page - 1) * pageSize;
    const slice = EVENTS.slice(start, start + pageSize);
    const totalPages = Math.ceil(EVENTS.length / pageSize);

    const builder = new ScreenBuilder().html(TitleComponent('Events'));

    for (const ev of slice) {
      const fill = Math.round((ev.participants / ev.capacity) * 100);
      builder.html(`\n\n${bold(ev.name)}\n${italic(ev.date)} · ${fill}% full`);
      builder.row(Button.navigate(`Open ${ev.name}`, `/events/${ev.id}`));
    }

    if (totalPages > 1) {
      builder.html('\n\n' + PaginationComponent(page, totalPages, (p) => `/events?page=${p}`));
    }

    builder.row(Button.back('← Dashboard'));
    return builder.build();
  }
}

class EventDetailScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    const event = ctx.data['event'] as Event | null;
    if (!event) {
      return new ScreenBuilder()
        .html(bold('Event not found'))
        .row(Button.back('← Back'))
        .build();
    }

    const fillPct = Math.round((event.participants / event.capacity) * 100);
    return new ScreenBuilder()
      .html(TitleComponent(event.name))
      .html(`\n\n📅 ${event.date}`)
      .html(`\n👥 ${event.participants} / ${event.capacity} participants (${fillPct}%)`)
      .row(Button.navigate('📋 Participant List', `/events/${event.id}/participants`))
      .row(Button.back('← Events'))
      .build();
  }
}

class ParticipantListScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html(TitleComponent('Participants'))
      .html(`\nEvent ID: ${ctx.params['id'] ?? '?'}`)
      .html('\n\n<i>Participant list would load here.</i>')
      .row(Button.back('← Event Detail'))
      .build();
  }
}

class SettingsScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html(TitleComponent('Settings'))
      .html('\nYour account settings:')
      .row(Button.navigate('Change Name', '/settings/name'))
      .row(Button.back('← Dashboard'))
      .build();
  }
}

class ChangeNameScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html(bold('Change Name'))
      .html('\n\nSend: <code>/name NewName</code>')
      .row(Button.back('← Settings'))
      .build();
  }
}

// ─── Bot setup ───────────────────────────────────────────────────────────────

const token = process.env['BOT_TOKEN'];
if (!token) throw new Error('BOT_TOKEN env var is required');

const bot = new Bot(token);

const engine = new GrammYNavigationEngine(bot, {
  encoder: new CompactCallbackEncoder(),
  routes: [
    { path: '/login', component: LoginScreen },
    { path: '/', component: () => DashboardScreen, guards: [AuthGuard] },
    { path: '/events', component: EventListScreen, guards: [AuthGuard] },
    { path: '/events/:id', component: EventDetailScreen, guards: [AuthGuard], resolvers: { event: EventResolver } },
    { path: '/events/:id/participants', component: ParticipantListScreen, guards: [AuthGuard] },
    { path: '/settings', component: SettingsScreen, guards: [AuthGuard] },
    { path: '/settings/name', component: ChangeNameScreen, guards: [AuthGuard] },
  ],
});

engine.use(SessionMiddleware);

// /start — entry point
bot.command('start', (ctx) => engine.send('/', ctx));

// /login <name> — simple auth command
bot.command('login', async (ctx) => {
  const name = ctx.match?.trim();
  if (!name) {
    await ctx.reply('Usage: /login YourName');
    return;
  }
  SESSIONS.set(ctx.from!.id, { userId: ctx.from!.id, name });
  await engine.navigate('/', ctx);
});

// /name <new-name> — change name command
bot.command('name', async (ctx) => {
  const name = ctx.match?.trim();
  if (!name) {
    await ctx.reply('Usage: /name NewName');
    return;
  }
  const existing = SESSIONS.get(ctx.from!.id);
  if (!existing) {
    await ctx.reply('Please /login first');
    return;
  }
  SESSIONS.set(ctx.from!.id, { ...existing, name });
  await ctx.reply(`Name updated to ${bold(name)}.`, { parse_mode: 'HTML' });
});

bot.start({ onStart: () => console.log('Event-manager bot started') });
