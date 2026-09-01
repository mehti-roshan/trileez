import { notificationRepository } from './repositories.ts';
import type { NotificationItem } from '../types/index.ts';

export type NotificationInput = Omit<NotificationItem, 'id' | 'createdAt' | 'read'> & { id?: string; createdAt?: string };

export function notify(input: NotificationInput) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return notificationRepository.create({
    ...input,
    id: input.id ?? `notification-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt,
    read: false,
    channel: input.channel ?? 'in_app',
  });
}

export function unreadNotificationCount(recipientId = 'u1') {
  return notificationRepository.list().filter((item) => !item.read && (!item.recipientId || item.recipientId === recipientId)).length;
}
