/**
 * Context extractors — converts grammY types to engine-internal types.
 *
 * These are pure functions kept separate so they can be tested without
 * instantiating a Bot, and can be reused across the adapter layer.
 */

import type { User, Chat } from 'grammy/types';
import type { TelegramUser, TelegramChat } from '../../core/interfaces/navigation.js';

export function extractTelegramUser(from: User): TelegramUser {
  const user: TelegramUser = {
    id: from.id,
    firstName: from.first_name,
    isBot: from.is_bot,
  };

  // Only include optional fields if they're present — exactOptionalPropertyTypes compliance.
  if (from.username !== undefined) {
    return { ...user, username: from.username };
  }
  if (from.last_name !== undefined) {
    return { ...user, lastName: from.last_name };
  }
  if (from.language_code !== undefined) {
    return { ...user, languageCode: from.language_code };
  }

  return user;
}

export function extractTelegramChat(chat: Chat): TelegramChat {
  const type = chat.type as TelegramChat['type'];
  const base: TelegramChat = { id: chat.id, type };

  if ('title' in chat && chat.title !== undefined) {
    return { ...base, title: chat.title };
  }

  return base;
}
