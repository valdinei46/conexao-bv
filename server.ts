import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CITY_NAME,
  getDistanceKmBetweenBairros,
  isValidBairroBV,
} from './src/shared/boaVista.ts';
import type { ChatIntent, PublicUser } from './src/shared/catalog.ts';
import {
  addGalleryPhoto,
  buyCoinPackage,
  buyVirtualItem,
  clampRadius,
  createGroupRoom,
  createPoll,
  createSession,
  db,
  deleteSession,
  ensurePrivateChatRoom,
  getAdminDashboardData,
  getGalleryPhotos,
  getRoomMessages,
  getRoomPolls,
  getRoomsForUser,
  getUserBySessionToken,
  getUserNotifications,
  getWalletState,
  hasAnyAdmin,
  hashPassword,
  joinGroupByCode,
  loginUser,
  postRoomMessage,
  purgeExpiredMessages,
  registerUser,
  rowToPublicUser,
  votePoll,
} from './src/server/db.ts';

interface AuthedRequest extends Request {
  user?: PublicUser;
  token?: string;
}

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.json({ limit: '6mb' }));

// Track active WebSocket connections per userId
const userSockets = new Map<string, Set<WebSocket>>();

function getOnlineUserIds(): Set<string> {
  const set = new Set<string>();
  for (const [uid, sockets] of userSockets.entries()) {
    if (sockets.size > 0) set.add(uid);
  }
  return set;
}

function sendToUser(userId: string, payload: unknown) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const serialized = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

function broadcastAll(payload: unknown) {
  const serialized = JSON.stringify(payload);
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }
}

function broadcastRoomEvent(roomId: string, roomType: string, memberIds: string[], payload: unknown) {
  if (roomType === 'city_group') {
    broadcastAll(payload);
    return;
  }
  for (const uid of memberIds) {
    sendToUser(uid, payload);
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Autenticação necessária.' });
    return;
  }
  const user = getUserBySessionToken(token, getOnlineUserIds());
  if (!user) {
    res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    return;
  }
  if (user.isBanned) {
    res.status(403).json({ error: `Conta suspensa: ${user.banReason || 'Violação das regras.'}` });
    return;
  }
  req.user = user;
  req.token = token;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito ao painel administrativo.' });
    return;
  }
  next();
}

// --- Auth & Bootstrap Routes ---
app.get('/api/auth/bootstrap', (_req, res) => {
  res.json({
    cityLocked: CITY_NAME,
    hasAdmin: hasAnyAdmin(),
    passcodeConfigured: Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0),
  });
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name, intent, neighborhood, radiusKm, bio, avatarUrl } = req.body ?? {};
    const validIntent: ChatIntent =
      intent === 'amizade' || intent === 'namoro' || intent === 'ambos' ? intent : 'ambos';
    const result = registerUser({
      email: String(email || ''),
      password: String(password || ''),
      name: String(name || ''),
      intent: validIntent,
      neighborhood: String(neighborhood || ''),
      radiusKm: Number(radiusKm ?? 8),
      bio: String(bio || ''),
      avatarUrl: String(avatarUrl || ''),
    });
    broadcastAll({ type: 'user:synced', user: result.user });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro no cadastro.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const result = loginUser(String(email || ''), String(password || ''));
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'Credenciais inválidas.' });
  }
});

app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
  if (req.token) deleteSession(req.token);
  res.json({ ok: true });
});

app.post('/api/auth/claim-admin', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const submittedPasscode = String(req.body?.passcode || '').trim();

  if (envPasscode) {
    const a = Buffer.from(submittedPasscode);
    const b = Buffer.from(envPasscode);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(403).json({ error: 'Código administrativo inválido.' });
      return;
    }
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
    const updated = rowToPublicUser(
      db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Record<string, unknown>,
      getOnlineUserIds()
    );
    res.json({ user: updated });
    return;
  }

  if (hasAnyAdmin() && user.role !== 'admin') {
    res.status(403).json({
      error: 'Já existe um administrador configurado. Use a conta administrativa ou configure ADMIN_PASSCODE.',
    });
    return;
  }

  if (!submittedPasscode || submittedPasscode.length < 6) {
    res.status(400).json({ error: 'Defina uma senha administrativa com pelo menos 6 caracteres.' });
    return;
  }

  db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE id = ?").run(
    hashPassword(submittedPasscode),
    user.id
  );
  const updated = rowToPublicUser(
    db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Record<string, unknown>,
    getOnlineUserIds()
  );
  res.json({ user: updated });
});

// --- Profile & Verification ---
app.get('/api/me', requireAuth, (req: AuthedRequest, res) => {
  const wallet = getWalletState(req.user!.id);
  res.json({ user: req.user, wallet });
});

app.patch('/api/me/profile', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const { name, bio, intent, neighborhood, radiusKm, avatarUrl } = req.body ?? {};
  const nextName = typeof name === 'string' && name.trim().length >= 2 ? name.trim().slice(0, 60) : user.name;
  const nextBio = typeof bio === 'string' ? bio.trim().slice(0, 240) : user.bio;
  const nextIntent: ChatIntent =
    intent === 'amizade' || intent === 'namoro' || intent === 'ambos' ? intent : user.intent;
  const nextNeighborhood =
    typeof neighborhood === 'string' && isValidBairroBV(neighborhood) ? neighborhood : user.neighborhood;
  const nextRadius = radiusKm !== undefined ? clampRadius(Number(radiusKm)) : user.radiusKm;
  const nextAvatar =
    typeof avatarUrl === 'string' && avatarUrl.trim().length > 0 ? avatarUrl.trim() : user.avatarUrl;

  db.prepare(`
    UPDATE users
    SET name = ?, bio = ?, intent = ?, neighborhood = ?, radius_km = ?, avatar_url = ?, last_seen = ?
    WHERE id = ?
  `).run(nextName, nextBio, nextIntent, nextNeighborhood, nextRadius, nextAvatar, Date.now(), user.id);

  const updated = rowToPublicUser(
    db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Record<string, unknown>,
    getOnlineUserIds()
  );
  broadcastAll({ type: 'user:synced', user: updated });
  res.json({ user: updated });
});

app.post('/api/me/verify-photo', requireAuth, (req: AuthedRequest, res) => {
  const photo = String(req.body?.photoData || '').trim();
  if (!photo.startsWith('data:image/')) {
    res.status(400).json({ error: 'Envie uma foto real válida para verificação.' });
    return;
  }
  db.prepare(`
    UPDATE users SET verification_photo = ?, verification_status = 'pending' WHERE id = ?
  `).run(photo, req.user!.id);

  const updated = rowToPublicUser(
    db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Record<string, unknown>,
    getOnlineUserIds()
  );
  broadcastAll({ type: 'user:synced', user: updated });
  res.json({ user: updated });
});

// --- Boa Vista Synced Directory ---
app.get('/api/users', requireAuth, (req: AuthedRequest, res) => {
  const onlineSet = getOnlineUserIds();
  const me = req.user!;
  const rows = db
    .prepare('SELECT * FROM users WHERE is_banned = 0 ORDER BY last_seen DESC')
    .all() as Record<string, unknown>[];

  const intentFilter = typeof req.query.intent === 'string' ? req.query.intent : 'todos';
  const maxRadius = clampRadius(Number(req.query.radiusKm || me.radiusKm));
  const ignoreRadius = req.query.allCity === 'true';

  const users = rows
    .map((r) => {
      const u = rowToPublicUser(r, onlineSet);
      const distanceKm = getDistanceKmBetweenBairros(me.neighborhood, u.neighborhood);
      return { ...u, distanceKm };
    })
    .filter((u) => {
      if (intentFilter !== 'todos' && u.intent !== 'ambos' && u.intent !== intentFilter) {
        return false;
      }
      if (!ignoreRadius && u.id !== me.id && u.distanceKm > maxRadius) {
        return false;
      }
      return true;
    });

  res.json({ users, city: CITY_NAME, centerNeighborhood: me.neighborhood, radiusKm: maxRadius });
});

// --- Rooms & Messages ---
app.get('/api/rooms', requireAuth, (req: AuthedRequest, res) => {
  const rooms = getRoomsForUser(req.user!.id, getOnlineUserIds());
  res.json({ rooms });
});

app.post('/api/rooms', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { mode, targetUserId, name, type, intent, neighborhood } = req.body ?? {};
    if (mode === 'private_chat') {
      const room = ensurePrivateChatRoom(req.user!.id, String(targetUserId || ''));
      sendToUser(String(targetUserId), { type: 'room:synced', room });
      res.status(201).json({ room });
      return;
    }
    const room = createGroupRoom({
      creatorId: req.user!.id,
      name: String(name || ''),
      type: type === 'city_group' ? 'city_group' : 'private_group',
      intent: intent === 'amizade' || intent === 'namoro' || intent === 'ambos' ? intent : 'ambos',
      neighborhood: String(neighborhood || req.user!.neighborhood),
    });
    if (room.type === 'city_group') {
      broadcastAll({ type: 'room:synced', room });
    }
    res.status(201).json({ room });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao criar sala.' });
  }
});

app.post('/api/rooms/join', requireAuth, (req: AuthedRequest, res) => {
  try {
    const room = joinGroupByCode(req.user!.id, String(req.body?.inviteCode || ''));
    res.json({ room });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Grupo não encontrado.' });
  }
});

app.get('/api/rooms/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const roomId = String(req.params.id);
  const messages = getRoomMessages(roomId);
  const polls = getRoomPolls(roomId, req.user!.id);
  res.json({ messages, polls });
});

app.post('/api/rooms/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  try {
    const roomId = String(req.params.id);
    const {
      content,
      msgType,
      photoData,
      photoFilter,
      smartFolder,
      giftId,
      isEncrypted,
      expiresInSeconds,
    } = req.body ?? {};

    const result = postRoomMessage({
      roomId,
      senderId: req.user!.id,
      content: String(content || ''),
      msgType: msgType === 'photo' || msgType === 'gift' ? msgType : 'text',
      photoData: photoData ? String(photoData) : null,
      photoFilter: photoFilter ? String(photoFilter) : null,
      smartFolder: smartFolder ? String(smartFolder) : null,
      giftId: giftId ? String(giftId) : null,
      isEncrypted: Boolean(isEncrypted),
      expiresInSeconds: expiresInSeconds ? Number(expiresInSeconds) : null,
    });

    broadcastRoomEvent(roomId, result.roomType, result.memberIds, {
      type: 'message:new',
      message: result.message,
    });

    for (const uid of result.memberIds) {
      if (uid !== req.user!.id) {
        sendToUser(uid, {
          type: 'notification:new',
          notification: {
            id: `ntf_live_${Date.now()}`,
            type: result.message.msgType === 'gift' ? 'gift' : 'message',
            title: `${req.user!.name} em ${result.roomName}`,
            body: result.message.isEncrypted
              ? 'Mensagem criptografada temporária'
              : result.message.msgType === 'photo'
                ? 'Enviou uma foto com filtro'
                : result.message.content.slice(0, 80),
            roomId,
            isRead: false,
            createdAt: Date.now(),
          },
        });
      }
    }

    const wallet = getWalletState(req.user!.id);
    res.status(201).json({ message: result.message, wallet });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao enviar mensagem.';
    const status = msg.includes('Saldo insuficiente') ? 402 : 400;
    res.status(status).json({ error: msg });
  }
});

// --- Polls ---
app.post('/api/rooms/:id/polls', requireAuth, (req: AuthedRequest, res) => {
  try {
    const roomId = String(req.params.id);
    const { question, locationBv, eventTime, options } = req.body ?? {};
    const { poll, memberIds } = createPoll({
      roomId,
      creatorId: req.user!.id,
      question: String(question || ''),
      locationBv: String(locationBv || 'Orla Taumanan — Centro'),
      eventTime: String(eventTime || 'Hoje, 18h'),
      options: Array.isArray(options) ? options.map(String) : [],
    });

    const roomRow = db.prepare('SELECT type FROM rooms WHERE id = ?').get(roomId) as { type: string };
    broadcastRoomEvent(roomId, roomRow?.type || 'private_group', memberIds, {
      type: 'poll:updated',
      poll,
    });

    for (const uid of memberIds) {
      if (uid !== req.user!.id) {
        sendToUser(uid, {
          type: 'notification:new',
          notification: {
            id: `ntf_poll_${Date.now()}`,
            type: 'poll',
            title: `Nova enquete de encontro`,
            body: `${poll.question} · ${poll.locationBv}`,
            roomId,
            isRead: false,
            createdAt: Date.now(),
          },
        });
      }
    }

    res.status(201).json({ poll });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao criar enquete.' });
  }
});

app.post('/api/polls/:pollId/vote', requireAuth, (req: AuthedRequest, res) => {
  try {
    const poll = votePoll(String(req.params.pollId), req.user!.id, Number(req.body?.optionIndex));
    const roomRow = db.prepare('SELECT type FROM rooms WHERE id = ?').get(poll.roomId) as { type: string };
    const members = db
      .prepare('SELECT user_id FROM room_members WHERE room_id = ?')
      .all(poll.roomId) as { user_id: string }[];
    broadcastRoomEvent(
      poll.roomId,
      roomRow?.type || 'private_group',
      members.map((m) => m.user_id),
      { type: 'poll:updated', poll }
    );
    res.json({ poll });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao votar.' });
  }
});

// --- Smart Folders Gallery ---
app.get('/api/gallery', requireAuth, (req, res) => {
  const folder = typeof req.query.folder === 'string' ? req.query.folder : undefined;
  res.json({ photos: getGalleryPhotos(folder) });
});

app.post('/api/gallery', requireAuth, (req: AuthedRequest, res) => {
  try {
    const { imageData, filterName, smartFolder, caption } = req.body ?? {};
    if (!String(imageData || '').startsWith('data:image/')) {
      res.status(400).json({ error: 'Imagem inválida.' });
      return;
    }
    const photo = addGalleryPhoto({
      ownerId: req.user!.id,
      imageData: String(imageData),
      filterName: String(filterName || 'Original'),
      smartFolder: String(smartFolder || 'Encontros & Rolês'),
      caption: String(caption || ''),
      neighborhood: req.user!.neighborhood,
    });
    broadcastAll({ type: 'gallery:new', photo });
    res.status(201).json({ photo });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao salvar foto.' });
  }
});

// --- ChatCoins Store ---
app.get('/api/store/wallet', requireAuth, (req: AuthedRequest, res) => {
  res.json(getWalletState(req.user!.id));
});

app.post('/api/store/buy-package', requireAuth, (req: AuthedRequest, res) => {
  try {
    const wallet = buyCoinPackage(req.user!.id, String(req.body?.packageId || ''));
    res.json(wallet);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao adquirir pacote.' });
  }
});

app.post('/api/store/buy-item', requireAuth, (req: AuthedRequest, res) => {
  try {
    const wallet = buyVirtualItem(req.user!.id, String(req.body?.itemId || ''));
    res.json(wallet);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro na loja.' });
  }
});

// --- Notifications ---
app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  res.json({ notifications: getUserNotifications(req.user!.id) });
});

app.post('/api/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

// --- Reports & Support ---
app.post('/api/reports', requireAuth, (req: AuthedRequest, res) => {
  const { reportedUserId, roomId, reason, details } = req.body ?? {};
  if (!reportedUserId || !reason) {
    res.status(400).json({ error: 'Informe o usuário e o motivo da denúncia.' });
    return;
  }
  const id = `rep_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(`
    INSERT INTO reports (id, reporter_id, reported_user_id, room_id, reason, details, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(
    id,
    req.user!.id,
    String(reportedUserId),
    roomId ? String(roomId) : null,
    String(reason).slice(0, 120),
    String(details || '').slice(0, 600),
    Date.now()
  );
  res.status(201).json({ ok: true, id });
});

app.get('/api/support', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(`
      SELECT t.*, u.name AS user_name
      FROM support_tickets t JOIN users u ON u.id = t.user_id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
    `)
    .all(req.user!.id) as Record<string, unknown>[];

  res.json({
    tickets: rows.map((t) => ({
      id: String(t.id),
      userId: String(t.user_id),
      userName: String(t.user_name),
      userEmail: String(t.user_email),
      subject: String(t.subject),
      category: String(t.category),
      message: String(t.message),
      status: String(t.status),
      adminReply: t.admin_reply ? String(t.admin_reply) : null,
      createdAt: Number(t.created_at),
    })),
  });
});

app.post('/api/support', requireAuth, (req: AuthedRequest, res) => {
  const { subject, category, message } = req.body ?? {};
  if (!subject || !message) {
    res.status(400).json({ error: 'Preencha assunto e descrição do chamado.' });
    return;
  }
  const id = `sup_${crypto.randomUUID().slice(0, 10)}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO support_tickets (id, user_id, user_email, subject, category, message, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(
    id,
    req.user!.id,
    req.user!.email,
    String(subject).slice(0, 120),
    String(category || 'Dúvida Geral').slice(0, 60),
    String(message).slice(0, 1200),
    now
  );
  res.status(201).json({ ok: true, id });
});

// --- Admin Panel Routes ---
app.get('/api/admin/overview', requireAuth, requireAdmin, (_req, res) => {
  res.json(getAdminDashboardData(getOnlineUserIds()));
});

app.post('/api/admin/users/:id/ban', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  const targetId = String(req.params.id);
  if (targetId === req.user!.id) {
    res.status(400).json({ error: 'Você não pode banir a própria conta.' });
    return;
  }
  const reason = String(req.body?.reason || 'Conduta incompatível com as diretrizes do Conexão BV.').slice(0, 200);
  db.prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?').run(reason, targetId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
  sendToUser(targetId, { type: 'user:banned', reason });
  res.json(getAdminDashboardData(getOnlineUserIds()));
});

app.post('/api/admin/users/:id/unban', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?').run(String(req.params.id));
  res.json(getAdminDashboardData(getOnlineUserIds()));
});

app.post('/api/admin/verifications/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = String(req.params.id);
  const decision = req.body?.decision === 'verified' ? 'verified' : 'rejected';
  db.prepare('UPDATE users SET verification_status = ? WHERE id = ?').run(decision, userId);

  const now = Date.now();
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, room_id, is_read, created_at)
    VALUES (?, ?, 'verification', ?, ?, NULL, 0, ?)
  `).run(
    `ntf_${crypto.randomUUID().slice(0, 10)}`,
    userId,
    decision === 'verified' ? 'Conta verificada com sucesso!' : 'Verificação de foto recusada',
    decision === 'verified'
      ? 'Sua foto real foi aprovada. O selo verificado já aparece no seu perfil.'
      : 'Envie uma foto nítida do seu rosto para tentar novamente.',
    now
  );

  const updated = rowToPublicUser(
    db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>,
    getOnlineUserIds()
  );
  broadcastAll({ type: 'user:synced', user: updated });
  sendToUser(userId, {
    type: 'notification:new',
    notification: {
      id: `ntf_ver_${now}`,
      type: 'verification',
      title: decision === 'verified' ? 'Conta verificada!' : 'Verificação recusada',
      body: decision === 'verified' ? 'Seu selo de foto real está ativo.' : 'Tente enviar uma nova selfie.',
      isRead: false,
      createdAt: now,
    },
  });

  res.json(getAdminDashboardData(getOnlineUserIds()));
});

app.post('/api/admin/reports/:id', requireAuth, requireAdmin, (req, res) => {
  const status = req.body?.status === 'resolved' ? 'resolved' : 'dismissed';
  db.prepare('UPDATE reports SET status = ? WHERE id = ?').run(status, String(req.params.id));
  res.json(getAdminDashboardData(getOnlineUserIds()));
});

app.post('/api/admin/support/:id/reply', requireAuth, requireAdmin, (req, res) => {
  const reply = String(req.body?.reply || '').trim().slice(0, 1200);
  if (!reply) {
    res.status(400).json({ error: 'Escreva uma resposta para o usuário.' });
    return;
  }
  db.prepare("UPDATE support_tickets SET status = 'answered', admin_reply = ? WHERE id = ?").run(
    reply,
    String(req.params.id)
  );
  res.json(getAdminDashboardData(getOnlineUserIds()));
});

// --- HTTP + WebSocket Server + Vite Integration ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
  const token = url.searchParams.get('token') || '';
  const user = token ? getUserBySessionToken(token, getOnlineUserIds()) : null;

  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  let sockets = userSockets.get(user.id);
  if (!sockets) {
    sockets = new Set();
    userSockets.set(user.id, sockets);
  }
  sockets.add(ws);
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);

  broadcastAll({ type: 'presence:update', onlineUserIds: Array.from(getOnlineUserIds()) });

  ws.on('close', () => {
    const set = userSockets.get(user.id);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        userSockets.delete(user.id);
      }
    }
    broadcastAll({ type: 'presence:update', onlineUserIds: Array.from(getOnlineUserIds()) });
  });
});

// Background sweep for ephemeral encrypted messages
setInterval(() => {
  const expired = purgeExpiredMessages();
  for (const item of expired) {
    broadcastAll({ type: 'message:expired', messageId: item.id, roomId: item.roomId });
  }
}, 4000);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Conexão BV server listening on port ${PORT}`);
  });
}

startServer();
