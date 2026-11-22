import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  CITY_NAME,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  isValidBairroBV,
} from '../shared/boaVista.ts';
import {
  COIN_PACKAGES,
  PRIVATE_MESSAGE_COST,
  SIGNUP_BONUS_COINS,
  SMART_FOLDERS,
  VIRTUAL_GIFTS,
  type AdminMetrics,
  type AppNotification,
  type ChatIntent,
  type ChatMessage,
  type ChatRoom,
  type CoinTransaction,
  type GalleryPhoto,
  type MeetupPoll,
  type PublicUser,
  type SmartFolder,
  type SupportTicket,
  type UserReport,
} from '../shared/catalog.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'conexaobv.db');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    intent TEXT NOT NULL DEFAULT 'ambos',
    city TEXT NOT NULL DEFAULT 'Boa Vista, RR',
    neighborhood TEXT NOT NULL DEFAULT 'Centro',
    radius_km INTEGER NOT NULL DEFAULT 8,
    avatar_url TEXT NOT NULL,
    chatcoins INTEGER NOT NULL DEFAULT 500,
    role TEXT NOT NULL DEFAULT 'user',
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    verification_photo TEXT,
    is_banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT,
    last_seen INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    intent TEXT NOT NULL,
    neighborhood TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    invite_code TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    msg_type TEXT NOT NULL DEFAULT 'text',
    photo_data TEXT,
    photo_filter TEXT,
    smart_folder TEXT,
    gift_id TEXT,
    gift_cost INTEGER NOT NULL DEFAULT 0,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    question TEXT NOT NULL,
    location_bv TEXT NOT NULL,
    event_time TEXT NOT NULL,
    options_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    PRIMARY KEY (poll_id, user_id),
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gallery_photos (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    room_id TEXT,
    image_data TEXT NOT NULL,
    filter_name TEXT NOT NULL DEFAULT 'Original',
    smart_folder TEXT NOT NULL DEFAULT 'Encontros & Rolês',
    caption TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT 'Centro',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS coin_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_inventory (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    reported_user_id TEXT NOT NULL,
    room_id TEXT,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    admin_reply TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    room_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function clampRadius(radiusKm: number): number {
  if (!Number.isFinite(radiusKm)) return 8;
  return Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, Math.round(radiusKm)));
}

export function sanitizeSmartFolder(folder?: string | null): SmartFolder {
  if (folder && SMART_FOLDERS.includes(folder as SmartFolder)) {
    return folder as SmartFolder;
  }
  return 'Encontros & Rolês';
}

export function rowToPublicUser(row: Record<string, unknown>, onlineSet?: Set<string>): PublicUser {
  const id = String(row.id);
  return {
    id,
    email: String(row.email),
    name: String(row.name),
    bio: String(row.bio ?? ''),
    intent: (row.intent as ChatIntent) || 'ambos',
    city: String(row.city || CITY_NAME),
    neighborhood: String(row.neighborhood || 'Centro'),
    radiusKm: Number(row.radius_km ?? 8),
    avatarUrl: String(row.avatar_url),
    chatcoins: Number(row.chatcoins ?? 0),
    role: row.role === 'admin' ? 'admin' : 'user',
    verificationStatus: (row.verification_status as PublicUser['verificationStatus']) || 'unverified',
    verificationPhoto: row.verification_photo ? String(row.verification_photo) : null,
    isBanned: Number(row.is_banned ?? 0) === 1,
    banReason: row.ban_reason ? String(row.ban_reason) : null,
    online: onlineSet ? onlineSet.has(id) : false,
    lastSeen: Number(row.last_seen ?? Date.now()),
    createdAt: Number(row.created_at ?? Date.now()),
  };
}

function seedInitialData() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM rooms').get() as { count: number };
  if (existing.count > 0) return;

  const now = Date.now();
  // Seed community rooms and realistic Boa Vista neighbor profiles for immediate testing
  // Note: none of these seeded accounts hold admin privilege — admin is claimed via first-run setup or carlikjr42@gmail.com
  const camilaId = 'usr_camila_bv';
  const lucasId = 'usr_lucas_bv';
  const placeholderPass = hashPassword(crypto.randomBytes(24).toString('hex'));

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, bio, intent, city, neighborhood, radius_km, avatar_url, chatcoins, role, verification_status, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    camilaId,
    'camila.orla@conexaobv.local',
    placeholderPass,
    'Camila Rocha',
    'Amo pôr do sol na Orla Taumanan, café gelado e novas amizades por Boa Vista.',
    'ambos',
    CITY_NAME,
    'Mecejana',
    10,
    '/src/assets/images/avatar_user_one_1795377678646.jpg',
    540,
    'user',
    'verified',
    now - 120_000,
    now - 86_400_000 * 3
  );

  insertUser.run(
    lucasId,
    'lucas.anaua@conexaobv.local',
    placeholderPass,
    'Lucas Menezes',
    'Corrida no Parque Anauá e boas conversas no fim de semana.',
    'amizade',
    CITY_NAME,
    'Caçari',
    12,
    '/src/assets/images/avatar_user_two_1795377679503.jpg',
    515,
    'user',
    'verified',
    now - 240_000,
    now - 86_400_000 * 2
  );

  const insertRoom = db.prepare(`
    INSERT INTO rooms (id, name, type, intent, neighborhood, creator_id, invite_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRoom.run('room_orla_amizade', 'Orla Taumanan — Amizades BV', 'city_group', 'amizade', 'Centro', camilaId, 'ORLA-BV', now - 86_400_000 * 2);
  insertRoom.run('room_namoro_bv', 'Conexões & Namoro — Boa Vista', 'city_group', 'namoro', 'Paraviana', camilaId, 'NAMORO-BV', now - 86_400_000 * 2);
  insertRoom.run('room_cafe_privado', 'Grupo Privado: Café & Fotografia', 'private_group', 'ambos', 'Mecejana', lucasId, 'CAFE-2026', now - 86_400_000);

  const insertMember = db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)');
  for (const rId of ['room_orla_amizade', 'room_namoro_bv', 'room_cafe_privado']) {
    insertMember.run(rId, camilaId, now);
    insertMember.run(rId, lucasId, now);
  }

  const insertMsg = db.prepare(`
    INSERT INTO messages (id, room_id, sender_id, content, msg_type, photo_data, photo_filter, smart_folder, is_encrypted, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertMsg.run(
    'msg_seed_1',
    'room_orla_amizade',
    camilaId,
    'Pessoal de Boa Vista! Quem anima um café e caminhada no Parque Anauá hoje às 17h30?',
    'text',
    null,
    null,
    null,
    0,
    now - 3_600_000 * 2
  );

  insertMsg.run(
    'msg_seed_2',
    'room_orla_amizade',
    lucasId,
    'Eu super animo! Tirei uma foto incrível ontem na Orla ao entardecer.',
    'photo',
    '/src/assets/images/boa_vista_banner_1795377679463.jpg',
    'Ouro Lavrado',
    'Paisagens de Boa Vista',
    0,
    now - 3_600_000
  );

  insertMsg.run(
    'msg_seed_3',
    'room_cafe_privado',
    camilaId,
    'Nosso último encontro no café do Centro foi ótimo!',
    'photo',
    '/src/assets/images/meetup_cafe_photo_1795377679073.jpg',
    'P&B Editorial',
    'Encontros & Rolês',
    0,
    now - 1_800_000
  );

  db.prepare(`
    INSERT INTO polls (id, room_id, creator_id, question, location_bv, event_time, options_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'poll_seed_1',
    'room_orla_amizade',
    camilaId,
    'Onde será nosso próximo encontro de amigos em Boa Vista?',
    'Orla Taumanan — Centro',
    'Sábado, 17h30',
    JSON.stringify(['Pôr do sol na Orla Taumanan', 'Caminhada no Parque Anauá', 'Café na Praça das Águas']),
    now - 1_500_000
  );

  db.prepare('INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)').run('poll_seed_1', camilaId, 0);
  db.prepare('INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES (?, ?, ?)').run('poll_seed_1', lucasId, 1);

  const insertPhoto = db.prepare(`
    INSERT INTO gallery_photos (id, owner_id, room_id, image_data, filter_name, smart_folder, caption, neighborhood, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPhoto.run(
    'gal_seed_1',
    lucasId,
    'room_orla_amizade',
    '/src/assets/images/boa_vista_banner_1795377679463.jpg',
    'Ouro Lavrado',
    'Paisagens de Boa Vista',
    'Fim de tarde na Orla do Rio Branco',
    'Centro',
    now - 3_600_000
  );
  insertPhoto.run(
    'gal_seed_2',
    camilaId,
    'room_cafe_privado',
    '/src/assets/images/meetup_cafe_photo_1795377679073.jpg',
    'P&B Editorial',
    'Encontros & Rolês',
    'Café de sábado com o grupo de Mecejana',
    'Mecejana',
    now - 1_800_000
  );
  insertPhoto.run(
    'gal_seed_3',
    camilaId,
    'room_namoro_bv',
    '/src/assets/images/meetup_sunset_park_1795377679211.jpg',
    'Pôr do Sol Orla',
    'Encontros & Rolês',
    'Caminhada no Parque Anauá ao pôr do sol',
    'Bairro dos Estados',
    now - 900_000
  );
}

seedInitialData();

export function hasAnyAdmin(): boolean {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number };
  return row.count > 0;
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

export function getUserBySessionToken(token: string, onlineSet?: Set<string>): PublicUser | null {
  const row = db
    .prepare(`
      SELECT u.* FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?
    `)
    .get(token, Date.now()) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToPublicUser(row, onlineSet);
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function registerUser(params: {
  email: string;
  password: string;
  name: string;
  intent: ChatIntent;
  neighborhood: string;
  radiusKm: number;
  bio: string;
  avatarUrl: string;
}): { user: PublicUser; token: string } {
  const email = params.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Informe um e-mail válido.');
  }
  if (!params.name.trim() || params.name.trim().length < 2) {
    throw new Error('Informe seu nome completo ou apelido.');
  }
  if (params.password.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }
  if (!isValidBairroBV(params.neighborhood)) {
    throw new Error('Selecione um bairro válido de Boa Vista, Roraima.');
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new Error('Este e-mail já está cadastrado no Conexão BV.');
  }

  const id = `usr_${crypto.randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const radius = clampRadius(params.radiusKm);
  const avatar = params.avatarUrl || '/src/assets/images/avatar_user_one_1795377678646.jpg';
  // Initial admin email from app creator metadata automatically receives admin role
  const role = email === 'carlikjr42@gmail.com' ? 'admin' : 'user';

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, bio, intent, city, neighborhood, radius_km, avatar_url, chatcoins, role, verification_status, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', ?, ?)
  `).run(
    id,
    email,
    hashPassword(params.password),
    params.name.trim(),
    params.bio.trim().slice(0, 240),
    params.intent,
    CITY_NAME,
    params.neighborhood,
    radius,
    avatar,
    SIGNUP_BONUS_COINS,
    role,
    now,
    now
  );

  db.prepare('INSERT INTO coin_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    `tx_${crypto.randomUUID().slice(0, 10)}`,
    id,
    SIGNUP_BONUS_COINS,
    'Bônus de boas-vindas Conexão BV',
    now
  );

  // Join public Boa Vista rooms automatically
  const joinMember = db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)');
  joinMember.run('room_orla_amizade', id, now);
  joinMember.run('room_namoro_bv', id, now);

  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, room_id, is_read, created_at)
    VALUES (?, ?, 'system', ?, ?, ?, 0, ?)
  `).run(
    `ntf_${crypto.randomUUID().slice(0, 10)}`,
    id,
    'Bem-vindo(a) ao Conexão BV!',
    `Você ganhou ${SIGNUP_BONUS_COINS} ChatCoins de boas-vindas. Seu perfil está ativo em ${params.neighborhood}, Boa Vista - RR.`,
    'room_orla_amizade',
    now
  );

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;
  const token = createSession(id);
  return { user: rowToPublicUser(row), token };
}

export function loginUser(emailRaw: string, password: string): { user: PublicUser; token: string } {
  const email = emailRaw.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Record<string, unknown> | undefined;
  if (!row || !verifyPassword(password, String(row.password_hash))) {
    throw new Error('E-mail ou senha inválidos.');
  }
  if (Number(row.is_banned) === 1) {
    throw new Error(`Conta suspensa: ${row.ban_reason || 'Violação das diretrizes do Conexão BV.'}`);
  }
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), String(row.id));
  const token = createSession(String(row.id));
  return { user: rowToPublicUser(row), token };
}

export function getRoomsForUser(userId: string, onlineSet?: Set<string>): ChatRoom[] {
  const rows = db
    .prepare(`
      SELECT r.*
      FROM rooms r
      LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
      WHERE r.type = 'city_group' OR rm.user_id IS NOT NULL
      ORDER BY r.created_at DESC
    `)
    .all(userId) as Record<string, unknown>[];

  const countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM room_members WHERE room_id = ?');
  const lastMsgStmt = db.prepare(
    'SELECT content, msg_type, is_encrypted, created_at FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1'
  );
  const otherMemberStmt = db.prepare(`
    SELECT u.* FROM room_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.room_id = ? AND rm.user_id != ?
    LIMIT 1
  `);

  return rows.map((row) => {
    const id = String(row.id);
    const type = String(row.type) as ChatRoom['type'];
    const countRow = countStmt.get(id) as { cnt: number };
    const lastRow = lastMsgStmt.get(id) as Record<string, unknown> | undefined;
    let lastPreview: string | null = null;
    if (lastRow) {
      if (Number(lastRow.is_encrypted) === 1) {
        lastPreview = 'Mensagem criptografada temporária';
      } else if (lastRow.msg_type === 'photo') {
        lastPreview = 'Foto compartilhada';
      } else if (lastRow.msg_type === 'gift') {
        lastPreview = 'Presente virtual enviado';
      } else {
        lastPreview = String(lastRow.content);
      }
    }
    let otherUser: PublicUser | null = null;
    if (type === 'private_chat') {
      const otherRow = otherMemberStmt.get(id, userId) as Record<string, unknown> | undefined;
      if (otherRow) {
        otherUser = rowToPublicUser(otherRow, onlineSet);
      }
    }

    return {
      id,
      name: otherUser ? otherUser.name : String(row.name),
      type,
      intent: (row.intent as ChatIntent) || 'ambos',
      neighborhood: String(row.neighborhood),
      creatorId: String(row.creator_id),
      inviteCode: row.invite_code ? String(row.invite_code) : null,
      memberCount: Number(countRow.cnt),
      lastMessage: lastPreview,
      lastMessageAt: lastRow ? Number(lastRow.created_at) : null,
      otherUser,
    };
  });
}

export function ensurePrivateChatRoom(userAId: string, userBId: string): ChatRoom {
  if (userAId === userBId) throw new Error('Não é possível iniciar chat privado consigo mesmo.');
  const otherRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userBId) as Record<string, unknown> | undefined;
  if (!otherRow) throw new Error('Usuário não encontrado.');

  const existing = db
    .prepare(`
      SELECT r.id FROM rooms r
      JOIN room_members rm1 ON rm1.room_id = r.id AND rm1.user_id = ?
      JOIN room_members rm2 ON rm2.room_id = r.id AND rm2.user_id = ?
      WHERE r.type = 'private_chat'
      LIMIT 1
    `)
    .get(userAId, userBId) as { id: string } | undefined;

  if (existing) {
    const rooms = getRoomsForUser(userAId);
    const found = rooms.find((r) => r.id === existing.id);
    if (found) return found;
  }

  const now = Date.now();
  const roomId = `room_dm_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(`
    INSERT INTO rooms (id, name, type, intent, neighborhood, creator_id, invite_code, created_at)
    VALUES (?, ?, 'private_chat', ?, ?, ?, NULL, ?)
  `).run(roomId, `Chat privado`, String(otherRow.intent), String(otherRow.neighborhood), userAId, now);

  db.prepare('INSERT INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(roomId, userAId, now);
  db.prepare('INSERT INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(roomId, userBId, now);

  const rooms = getRoomsForUser(userAId);
  return rooms.find((r) => r.id === roomId)!;
}

export function createGroupRoom(params: {
  creatorId: string;
  name: string;
  type: 'private_group' | 'city_group';
  intent: ChatIntent;
  neighborhood: string;
}): ChatRoom {
  if (!params.name.trim() || params.name.trim().length < 3) {
    throw new Error('O nome do grupo deve ter pelo menos 3 caracteres.');
  }
  const neighborhood = isValidBairroBV(params.neighborhood) ? params.neighborhood : 'Centro';
  const now = Date.now();
  const roomId = `room_grp_${crypto.randomUUID().slice(0, 10)}`;
  const inviteCode = `BV-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO rooms (id, name, type, intent, neighborhood, creator_id, invite_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(roomId, params.name.trim().slice(0, 60), params.type, params.intent, neighborhood, params.creatorId, inviteCode, now);

  db.prepare('INSERT INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(roomId, params.creatorId, now);

  const rooms = getRoomsForUser(params.creatorId);
  return rooms.find((r) => r.id === roomId)!;
}

export function joinGroupByCode(userId: string, codeRaw: string): ChatRoom {
  const code = codeRaw.trim().toUpperCase();
  const row = db.prepare('SELECT * FROM rooms WHERE UPPER(invite_code) = ?').get(code) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error('Código de convite não encontrado em Boa Vista.');
  }
  db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)').run(
    String(row.id),
    userId,
    Date.now()
  );
  const rooms = getRoomsForUser(userId);
  return rooms.find((r) => r.id === String(row.id))!;
}

export function userHasRoomAccess(userId: string, roomId: string): boolean {
  const room = db.prepare('SELECT type FROM rooms WHERE id = ?').get(roomId) as { type: string } | undefined;
  if (!room) return false;
  if (room.type === 'city_group') return true;
  const member = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId);
  return Boolean(member);
}

export function getRoomMessages(roomId: string): ChatMessage[] {
  const now = Date.now();
  const rows = db
    .prepare(`
      SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar, u.verification_status AS sender_verification
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = ? AND (m.expires_at IS NULL OR m.expires_at > ?)
      ORDER BY m.created_at ASC
      LIMIT 200
    `)
    .all(roomId, now) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    roomId: String(row.room_id),
    senderId: String(row.sender_id),
    senderName: String(row.sender_name),
    senderAvatar: String(row.sender_avatar),
    senderVerified: row.sender_verification === 'verified',
    content: String(row.content),
    msgType: (row.msg_type as ChatMessage['msgType']) || 'text',
    photoData: row.photo_data ? String(row.photo_data) : null,
    photoFilter: row.photo_filter ? String(row.photo_filter) : null,
    smartFolder: row.smart_folder ? (String(row.smart_folder) as SmartFolder) : null,
    giftId: row.gift_id ? String(row.gift_id) : null,
    giftCost: Number(row.gift_cost ?? 0),
    isEncrypted: Number(row.is_encrypted ?? 0) === 1,
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    createdAt: Number(row.created_at),
  }));
}

export function postRoomMessage(params: {
  roomId: string;
  senderId: string;
  content: string;
  msgType: 'text' | 'photo' | 'gift';
  photoData?: string | null;
  photoFilter?: string | null;
  smartFolder?: string | null;
  giftId?: string | null;
  isEncrypted?: boolean;
  expiresInSeconds?: number | null;
}): {
  message: ChatMessage;
  updatedCoins: number;
  memberIds: string[];
  roomName: string;
  roomType: string;
} {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(params.roomId) as Record<string, unknown> | undefined;
  if (!room) throw new Error('Sala não encontrada.');
  if (!userHasRoomAccess(params.senderId, params.roomId)) {
    throw new Error('Você não tem acesso a este grupo privado.');
  }

  const sender = db.prepare('SELECT * FROM users WHERE id = ?').get(params.senderId) as Record<string, unknown>;
  if (!sender) throw new Error('Usuário inválido.');
  if (Number(sender.is_banned) === 1) throw new Error('Conta suspensa.');

  const now = Date.now();
  let totalCoinCost = 0;

  // Private chat messages always cost 5 ChatCoins per message sent
  if (room.type === 'private_chat') {
    totalCoinCost += PRIVATE_MESSAGE_COST;
  }

  let giftItem = null;
  if (params.msgType === 'gift' && params.giftId) {
    giftItem = VIRTUAL_GIFTS.find((g) => g.id === params.giftId) ?? null;
    if (!giftItem) throw new Error('Presente virtual inválido.');
    // Check if user already owns it in inventory, otherwise deduct gift cost
    const inv = db
      .prepare('SELECT quantity FROM user_inventory WHERE user_id = ? AND item_id = ?')
      .get(params.senderId, giftItem.id) as { quantity: number } | undefined;
    if (inv && inv.quantity > 0) {
      db.prepare('UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = ? AND item_id = ?').run(
        params.senderId,
        giftItem.id
      );
    } else {
      totalCoinCost += giftItem.cost;
    }
  }

  if (totalCoinCost > 0) {
    const result = db
      .prepare('UPDATE users SET chatcoins = chatcoins - ? WHERE id = ? AND chatcoins >= ?')
      .run(totalCoinCost, params.senderId, totalCoinCost);
    if (result.changes === 0) {
      throw new Error(
        `Saldo insuficiente de ChatCoins. São necessários ${totalCoinCost} ChatCoins (5 por mensagem em chat privado). Recarregue na Loja!`
      );
    }
    const reasonParts: string[] = [];
    if (room.type === 'private_chat') reasonParts.push(`Mensagem privada (-${PRIVATE_MESSAGE_COST})`);
    if (giftItem) reasonParts.push(`Presente ${giftItem.name} (-${giftItem.cost})`);
    db.prepare('INSERT INTO coin_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
      `tx_${crypto.randomUUID().slice(0, 10)}`,
      params.senderId,
      -totalCoinCost,
      reasonParts.join(' + '),
      now
    );
  }

  const expiresAt =
    params.expiresInSeconds && params.expiresInSeconds > 0
      ? now + Math.min(86400, Math.max(10, Math.round(params.expiresInSeconds))) * 1000
      : null;

  const msgId = `msg_${crypto.randomUUID().slice(0, 12)}`;
  const folder = params.msgType === 'photo' ? sanitizeSmartFolder(params.smartFolder) : null;

  db.prepare(`
    INSERT INTO messages (id, room_id, sender_id, content, msg_type, photo_data, photo_filter, smart_folder, gift_id, gift_cost, is_encrypted, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    msgId,
    params.roomId,
    params.senderId,
    params.content.slice(0, 4000),
    params.msgType,
    params.photoData || null,
    params.photoFilter || null,
    folder,
    giftItem ? giftItem.id : null,
    giftItem ? giftItem.cost : 0,
    params.isEncrypted ? 1 : 0,
    expiresAt,
    now
  );

  // Sync shared photo automatically to Smart Folders Gallery (if not ephemeral encrypted)
  if (params.msgType === 'photo' && params.photoData && !expiresAt) {
    db.prepare(`
      INSERT INTO gallery_photos (id, owner_id, room_id, image_data, filter_name, smart_folder, caption, neighborhood, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `gal_${crypto.randomUUID().slice(0, 10)}`,
      params.senderId,
      params.roomId,
      params.photoData,
      params.photoFilter || 'Original',
      folder || 'Encontros & Rolês',
      params.content.slice(0, 140) || 'Compartilhada no chat',
      String(sender.neighborhood),
      now
    );
  }

  const updatedUser = db.prepare('SELECT chatcoins FROM users WHERE id = ?').get(params.senderId) as { chatcoins: number };
  const members = db
    .prepare('SELECT user_id FROM room_members WHERE room_id = ?')
    .all(params.roomId) as { user_id: string }[];

  // Create real-time notification entries for recipients
  const recipientIds = members.map((m) => m.user_id).filter((uid) => uid !== params.senderId);
  const notifTitle =
    params.msgType === 'gift' && giftItem
      ? `${sender.name} enviou ${giftItem.icon} ${giftItem.name}`
      : `Nova mensagem de ${sender.name}`;
  const notifBody = params.isEncrypted
    ? 'Mensagem criptografada temporária recebida'
    : params.msgType === 'photo'
      ? `Compartilhou uma foto em ${room.name}`
      : params.content.slice(0, 90);

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, room_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `);
  for (const uid of recipientIds) {
    insertNotif.run(
      `ntf_${crypto.randomUUID().slice(0, 10)}`,
      uid,
      params.msgType === 'gift' ? 'gift' : 'message',
      notifTitle,
      notifBody,
      params.roomId,
      now
    );
  }

  return {
    message: {
      id: msgId,
      roomId: params.roomId,
      senderId: params.senderId,
      senderName: String(sender.name),
      senderAvatar: String(sender.avatar_url),
      senderVerified: sender.verification_status === 'verified',
      content: params.content.slice(0, 4000),
      msgType: params.msgType,
      photoData: params.photoData || null,
      photoFilter: params.photoFilter || null,
      smartFolder: folder,
      giftId: giftItem ? giftItem.id : null,
      giftCost: giftItem ? giftItem.cost : 0,
      isEncrypted: Boolean(params.isEncrypted),
      expiresAt,
      createdAt: now,
    },
    updatedCoins: updatedUser.chatcoins,
    memberIds: members.map((m) => m.user_id),
    roomName: String(room.name),
    roomType: String(room.type),
  };
}

export function getRoomPolls(roomId: string, currentUserId: string): MeetupPoll[] {
  const rows = db
    .prepare(`
      SELECT p.*, u.name AS creator_name
      FROM polls p
      JOIN users u ON u.id = p.creator_id
      WHERE p.room_id = ?
      ORDER BY p.created_at DESC
    `)
    .all(roomId) as Record<string, unknown>[];

  const voteStmt = db.prepare(`
    SELECT pv.option_index, pv.user_id, u.name
    FROM poll_votes pv
    JOIN users u ON u.id = pv.user_id
    WHERE pv.poll_id = ?
  `);

  return rows.map((row) => {
    const id = String(row.id);
    const optionTexts = JSON.parse(String(row.options_json)) as string[];
    const votes = voteStmt.all(id) as { option_index: number; user_id: string; name: string }[];
    let userVoteIndex: number | null = null;

    const options = optionTexts.map((text, idx) => {
      const matched = votes.filter((v) => v.option_index === idx);
      if (matched.some((v) => v.user_id === currentUserId)) {
        userVoteIndex = idx;
      }
      return {
        text,
        votes: matched.length,
        voters: matched.map((v) => v.name),
      };
    });

    return {
      id,
      roomId: String(row.room_id),
      creatorId: String(row.creator_id),
      creatorName: String(row.creator_name),
      question: String(row.question),
      locationBv: String(row.location_bv),
      eventTime: String(row.event_time),
      options,
      userVoteIndex,
      createdAt: Number(row.created_at),
    };
  });
}

export function createPoll(params: {
  roomId: string;
  creatorId: string;
  question: string;
  locationBv: string;
  eventTime: string;
  options: string[];
}): { poll: MeetupPoll; memberIds: string[] } {
  if (!userHasRoomAccess(params.creatorId, params.roomId)) {
    throw new Error('Sem acesso à sala.');
  }
  const cleanOptions = params.options.map((o) => o.trim()).filter(Boolean).slice(0, 5);
  if (cleanOptions.length < 2) {
    throw new Error('Adicione pelo menos 2 opções para a enquete.');
  }
  const now = Date.now();
  const pollId = `poll_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(`
    INSERT INTO polls (id, room_id, creator_id, question, location_bv, event_time, options_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pollId,
    params.roomId,
    params.creatorId,
    params.question.trim().slice(0, 160),
    params.locationBv.trim().slice(0, 100),
    params.eventTime.trim().slice(0, 60),
    JSON.stringify(cleanOptions),
    now
  );

  const creator = db.prepare('SELECT name FROM users WHERE id = ?').get(params.creatorId) as { name: string };
  const members = db
    .prepare('SELECT user_id FROM room_members WHERE room_id = ?')
    .all(params.roomId) as { user_id: string }[];

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, room_id, is_read, created_at)
    VALUES (?, ?, 'poll', ?, ?, ?, 0, ?)
  `);
  for (const m of members) {
    if (m.user_id !== params.creatorId) {
      insertNotif.run(
        `ntf_${crypto.randomUUID().slice(0, 10)}`,
        m.user_id,
        `Nova enquete de encontro: ${params.locationBv}`,
        `${creator.name} criou "${params.question.trim()}" (${params.eventTime})`,
        params.roomId,
        now
      );
    }
  }

  const polls = getRoomPolls(params.roomId, params.creatorId);
  return {
    poll: polls.find((p) => p.id === pollId)!,
    memberIds: members.map((m) => m.user_id),
  };
}

export function votePoll(pollId: string, userId: string, optionIndex: number): MeetupPoll {
  const poll = db.prepare('SELECT room_id, options_json FROM polls WHERE id = ?').get(pollId) as
    | { room_id: string; options_json: string }
    | undefined;
  if (!poll) throw new Error('Enquete não encontrada.');
  const options = JSON.parse(poll.options_json) as string[];
  if (optionIndex < 0 || optionIndex >= options.length) {
    throw new Error('Opção inválida.');
  }
  db.prepare(`
    INSERT INTO poll_votes (poll_id, user_id, option_index)
    VALUES (?, ?, ?)
    ON CONFLICT(poll_id, user_id) DO UPDATE SET option_index = excluded.option_index
  `).run(pollId, userId, optionIndex);

  const polls = getRoomPolls(poll.room_id, userId);
  return polls.find((p) => p.id === pollId)!;
}

export function getGalleryPhotos(folder?: string): GalleryPhoto[] {
  const sql = folder && folder !== 'Todas'
    ? `SELECT g.*, u.name AS owner_name, u.avatar_url AS owner_avatar
       FROM gallery_photos g JOIN users u ON u.id = g.owner_id
       WHERE g.smart_folder = ? ORDER BY g.created_at DESC LIMIT 120`
    : `SELECT g.*, u.name AS owner_name, u.avatar_url AS owner_avatar
       FROM gallery_photos g JOIN users u ON u.id = g.owner_id
       ORDER BY g.created_at DESC LIMIT 120`;

  const rows = (folder && folder !== 'Todas' ? db.prepare(sql).all(folder) : db.prepare(sql).all()) as Record<
    string,
    unknown
  >[];

  return rows.map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    ownerName: String(row.owner_name),
    ownerAvatar: String(row.owner_avatar),
    roomId: row.room_id ? String(row.room_id) : null,
    imageData: String(row.image_data),
    filterName: String(row.filter_name),
    smartFolder: sanitizeSmartFolder(String(row.smart_folder)),
    caption: String(row.caption),
    neighborhood: String(row.neighborhood),
    createdAt: Number(row.created_at),
  }));
}

export function addGalleryPhoto(params: {
  ownerId: string;
  imageData: string;
  filterName: string;
  smartFolder: string;
  caption: string;
  neighborhood: string;
}): GalleryPhoto {
  const now = Date.now();
  const id = `gal_${crypto.randomUUID().slice(0, 10)}`;
  const folder = sanitizeSmartFolder(params.smartFolder);
  db.prepare(`
    INSERT INTO gallery_photos (id, owner_id, room_id, image_data, filter_name, smart_folder, caption, neighborhood, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.ownerId,
    params.imageData,
    params.filterName || 'Original',
    folder,
    params.caption.trim().slice(0, 140) || 'Momento em Boa Vista',
    isValidBairroBV(params.neighborhood) ? params.neighborhood : 'Centro',
    now
  );

  const photos = getGalleryPhotos();
  return photos.find((p) => p.id === id)!;
}

export function buyCoinPackage(userId: string, packageId: string): { chatcoins: number; transactions: CoinTransaction[] } {
  const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) throw new Error('Pacote de ChatCoins não encontrado.');
  const now = Date.now();
  db.prepare('UPDATE users SET chatcoins = chatcoins + ? WHERE id = ?').run(pkg.coins, userId);
  db.prepare('INSERT INTO coin_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    `tx_${crypto.randomUUID().slice(0, 10)}`,
    userId,
    pkg.coins,
    `Compra: ${pkg.name} (+${pkg.coins} moedas)`,
    now
  );
  return getWalletState(userId);
}

export function buyVirtualItem(userId: string, itemId: string): {
  chatcoins: number;
  transactions: CoinTransaction[];
  inventory: Record<string, number>;
} {
  const item = VIRTUAL_GIFTS.find((g) => g.id === itemId);
  if (!item) throw new Error('Item da loja não encontrado.');
  const res = db
    .prepare('UPDATE users SET chatcoins = chatcoins - ? WHERE id = ? AND chatcoins >= ?')
    .run(item.cost, userId, item.cost);
  if (res.changes === 0) {
    throw new Error('ChatCoins insuficientes para comprar este item.');
  }
  const now = Date.now();
  db.prepare(`
    INSERT INTO user_inventory (user_id, item_id, quantity) VALUES (?, ?, 1)
    ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + 1
  `).run(userId, item.id);
  db.prepare('INSERT INTO coin_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    `tx_${crypto.randomUUID().slice(0, 10)}`,
    userId,
    -item.cost,
    `Loja: ${item.icon} ${item.name}`,
    now
  );
  return getWalletState(userId);
}

export function getWalletState(userId: string): {
  chatcoins: number;
  transactions: CoinTransaction[];
  inventory: Record<string, number>;
} {
  const user = db.prepare('SELECT chatcoins FROM users WHERE id = ?').get(userId) as { chatcoins: number };
  const txs = db
    .prepare('SELECT id, amount, reason, created_at FROM coin_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(userId) as { id: string; amount: number; reason: string; created_at: number }[];
  const invRows = db
    .prepare('SELECT item_id, quantity FROM user_inventory WHERE user_id = ? AND quantity > 0')
    .all(userId) as { item_id: string; quantity: number }[];

  const inventory: Record<string, number> = {};
  for (const r of invRows) {
    inventory[r.item_id] = r.quantity;
  }

  return {
    chatcoins: user.chatcoins,
    transactions: txs.map((t) => ({ id: t.id, amount: t.amount, reason: t.reason, createdAt: t.created_at })),
    inventory,
  };
}

export function getUserNotifications(userId: string): AppNotification[] {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(userId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    type: (r.type as AppNotification['type']) || 'system',
    title: String(r.title),
    body: String(r.body),
    roomId: r.room_id ? String(r.room_id) : null,
    isRead: Number(r.is_read) === 1,
    createdAt: Number(r.created_at),
  }));
}

export function purgeExpiredMessages(): { id: string; roomId: string }[] {
  const now = Date.now();
  const expired = db
    .prepare('SELECT id, room_id FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?')
    .all(now) as { id: string; room_id: string }[];
  if (expired.length > 0) {
    db.prepare('DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now);
  }
  return expired.map((e) => ({ id: e.id, roomId: e.room_id }));
}

export function getAdminDashboardData(onlineSet: Set<string>): {
  metrics: AdminMetrics;
  users: PublicUser[];
  reports: UserReport[];
  tickets: SupportTicket[];
} {
  const usersCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  const verifiedCount = (
    db.prepare("SELECT COUNT(*) AS c FROM users WHERE verification_status = 'verified'").get() as { c: number }
  ).c;
  const bannedCount = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_banned = 1').get() as { c: number }).c;
  const pendingVerif = (
    db.prepare("SELECT COUNT(*) AS c FROM users WHERE verification_status = 'pending'").get() as { c: number }
  ).c;
  const roomsCount = (db.prepare('SELECT COUNT(*) AS c FROM rooms').get() as { c: number }).c;
  const msgsCount = (db.prepare('SELECT COUNT(*) AS c FROM messages').get() as { c: number }).c;
  const pollsCount = (db.prepare('SELECT COUNT(*) AS c FROM polls').get() as { c: number }).c;
  const photosCount = (db.prepare('SELECT COUNT(*) AS c FROM gallery_photos').get() as { c: number }).c;
  const coinsSum = (db.prepare('SELECT COALESCE(SUM(chatcoins), 0) AS s FROM users').get() as { s: number }).s;
  const openReports = (db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'open'").get() as { c: number }).c;
  const openTickets = (
    db.prepare("SELECT COUNT(*) AS c FROM support_tickets WHERE status = 'open'").get() as { c: number }
  ).c;

  const userRows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Record<string, unknown>[];
  const reportRows = db
    .prepare(`
      SELECT r.*, u1.name AS reporter_name, u2.name AS reported_name, u2.email AS reported_email
      FROM reports r
      JOIN users u1 ON u1.id = r.reporter_id
      JOIN users u2 ON u2.id = r.reported_user_id
      ORDER BY r.created_at DESC
    `)
    .all() as Record<string, unknown>[];

  const ticketRows = db
    .prepare(`
      SELECT t.*, u.name AS user_name
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC
    `)
    .all() as Record<string, unknown>[];

  return {
    metrics: {
      totalUsers: usersCount,
      verifiedUsers: verifiedCount,
      bannedUsers: bannedCount,
      totalRooms: roomsCount,
      totalMessages: msgsCount,
      totalPolls: pollsCount,
      totalPhotos: photosCount,
      totalCoinsCirculating: coinsSum,
      openReports,
      pendingVerifications: pendingVerif,
      openTickets,
    },
    users: userRows.map((r) => rowToPublicUser(r, onlineSet)),
    reports: reportRows.map((r) => ({
      id: String(r.id),
      reporterId: String(r.reporter_id),
      reporterName: String(r.reporter_name),
      reportedUserId: String(r.reported_user_id),
      reportedUserName: String(r.reported_name),
      reportedUserEmail: String(r.reported_email),
      roomId: r.room_id ? String(r.room_id) : null,
      reason: String(r.reason),
      details: String(r.details),
      status: (r.status as UserReport['status']) || 'open',
      createdAt: Number(r.created_at),
    })),
    tickets: ticketRows.map((t) => ({
      id: String(t.id),
      userId: String(t.user_id),
      userName: String(t.user_name),
      userEmail: String(t.user_email),
      subject: String(t.subject),
      category: String(t.category),
      message: String(t.message),
      status: (t.status as SupportTicket['status']) || 'open',
      adminReply: t.admin_reply ? String(t.admin_reply) : null,
      createdAt: Number(t.created_at),
    })),
  };
}
