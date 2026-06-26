/**
 * Minimal example — a two-screen bot using GrammYNavigationEngine.
 *
 * Run:
 *   BOT_TOKEN=<your-token> npx ts-node examples/minimal/index.ts
 */

import { Bot } from 'grammy';
import {
  GrammYNavigationEngine,
  ScreenBuilder,
  Button,
  bold,
} from '../../src/index.js';
import type { ScreenComponent, ScreenView, NavigationContext } from '../../src/index.js';

// ─── Screens ─────────────────────────────────────────────────────────────────

class HomeScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html(bold(`Hi, ${ctx.user.firstName}! 👋`))
      .html('\nThis is the home screen.')
      .row(Button.navigate('View Profile', '/profile'))
      .build();
  }
}

class ProfileScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html(bold('Your Profile'))
      .html(`\n👤 ${ctx.user.firstName}`)
      .html(`\n🆔 ${ctx.user.id}`)
      .row(Button.back('← Home'))
      .build();
  }
}

// ─── Bot setup ───────────────────────────────────────────────────────────────

const token = process.env['BOT_TOKEN'];
if (!token) throw new Error('BOT_TOKEN env var is required');

const bot = new Bot(token);

const engine = new GrammYNavigationEngine(bot, {
  routes: [
    { path: '/', component: HomeScreen },
    { path: '/profile', component: ProfileScreen },
  ],
});

bot.command('start', (ctx) => engine.send('/', ctx));

bot.start({ onStart: () => console.log('Minimal bot started') });
