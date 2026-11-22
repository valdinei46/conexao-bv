import type { ChatMessage, ChatRoom, GalleryPhoto, MeetupPoll } from '../shared/catalog';

const CACHE_KEY_PREFIX = 'conexaobv_offline_v1_';

export interface OfflineSnapshot {
  rooms: ChatRoom[];
  messagesByRoom: Record<string, ChatMessage[]>;
  pollsByRoom: Record<string, MeetupPoll[]>;
  gallery: GalleryPhoto[];
  savedAt: number;
}

export function saveOfflineSnapshot(userId: string, snapshot: Partial<OfflineSnapshot>): void {
  try {
    const key = `${CACHE_KEY_PREFIX}${userId}`;
    const existing = loadOfflineSnapshot(userId);
    const merged: OfflineSnapshot = {
      rooms: snapshot.rooms ?? existing?.rooms ?? [],
      messagesByRoom: {
        ...(existing?.messagesByRoom ?? {}),
        ...(snapshot.messagesByRoom ?? {}),
      },
      pollsByRoom: {
        ...(existing?.pollsByRoom ?? {}),
        ...(snapshot.pollsByRoom ?? {}),
      },
      gallery: snapshot.gallery ?? existing?.gallery ?? [],
      savedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    // Ignore quota errors gracefully
  }
}

export function loadOfflineSnapshot(userId: string): OfflineSnapshot | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as OfflineSnapshot;
  } catch {
    return null;
  }
}

export function clearOfflineSnapshot(userId: string): void {
  try {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
  } catch {
    // Ignore
  }
}
