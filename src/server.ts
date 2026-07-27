import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import config from './config.ts';
import { LOG_PREFIX } from './preferences.ts';
import { validateInitData, type TelegramUser } from './auth.ts';
import * as repo from './db/repo.ts';
import * as rooms from './rooms.ts';
import { localDate } from './assignments.ts';
import { getStreakSummary } from './streak.ts';
import { LOCALES } from './i18n.ts';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function sendFile(res: ServerResponse, filePath: string, contentType: string): void {
  try {
    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const content = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function authenticateRequest(req: IncomingMessage): { user: TelegramUser; userId: number } | null {
  const authHeader = req.headers.authorization || '';
  let initData = '';
  if (authHeader.startsWith('Bearer ')) {
    initData = authHeader.slice('Bearer '.length).trim();
  } else if (typeof req.headers['x-telegram-init-data'] === 'string') {
    initData = req.headers['x-telegram-init-data'];
  }

  // In test mode with mock token or missing token, allow fallback if specified
  const authRes = validateInitData(initData, config.telegramBotToken, 0); // maxAge 0 = skip expiry check in local dev
  if (!authRes.valid || !authRes.user) {
    return null;
  }
  return { user: authRes.user, userId: authRes.user.id };
}

export function startHealthServer(port: number = config.port): Server {
  const publicDir = join(process.cwd(), 'public');

  const server = createServer(async (req, res) => {
    const method = req.method || 'GET';
    const urlStr = req.url || '/';
    const [path] = urlStr.split('?');

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      });
      res.end();
      return;
    }

    // Static Asset routes
    if (method === 'GET') {
      if (path === '/' || path === '/app' || path === '/index.html') {
        return sendFile(res, join(publicDir, 'index.html'), 'text/html; charset=utf-8');
      }
      if (path === '/style.css') {
        return sendFile(res, join(publicDir, 'style.css'), 'text/css; charset=utf-8');
      }
      if (path === '/app.js') {
        return sendFile(res, join(publicDir, 'app.js'), 'application/javascript; charset=utf-8');
      }
      if (path === '/health') {
        return sendJson(res, 200, { status: 'ok' });
      }
    }

    // API Routes (Require Auth)
    if (path.startsWith('/api/')) {
      const auth = authenticateRequest(req);
      if (!auth) {
        return sendJson(res, 401, { error: 'Unauthorized: Invalid Telegram WebApp initData' });
      }
      const { userId, user } = auth;
      const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
      const username = user.username || null;
      repo.upsertUser(userId, displayName, username);
      const today = localDate(new Date(), config.tz);

      try {
        // GET /api/me
        if (method === 'GET' && path === '/api/me') {
          const userPrefs = repo.getUserPrefs(userId);
          const activeRooms = repo.listActiveRoomsForUser(userId);
          const todayAssignments: Array<{
            id: number;
            roomId: number;
            text: string;
            kind: string;
            prayedToday: boolean;
            updates?: Array<{ id: number; text: string; createdAt: string }>;
          }> = [];

          for (const room of activeRooms) {
            const topics = repo.listTopics(room.id);
            for (const topic of topics) {
              if (topic.status === 'active') {
                const prayed = repo.hasPrayed(userId, topic.id, today);
                todayAssignments.push({
                  id: topic.id,
                  roomId: room.id,
                  text: topic.text,
                  kind: topic.kind,
                  prayedToday: prayed,
                  updates: repo.listTopicUpdates(topic.id),
                });
              }
            }
          }

          return sendJson(res, 200, {
            user: {
              id: userId,
              firstName: user.first_name,
              reminderTime: userPrefs?.reminderTime ?? '09:00',
              reminderEnabled: userPrefs?.reminderEnabled ?? true,
              locale: userPrefs?.locale ?? config.defaultLocale,
              theme: userPrefs?.theme ?? 'auto',
            },
            locales: LOCALES,
            todayAssignments,
            streak: getStreakSummary(userId, today),
          });
        }

        // GET /api/me/streak
        if (method === 'GET' && path === '/api/me/streak') {
          return sendJson(res, 200, getStreakSummary(userId, today));
        }

        // GET /api/me/today
        if (method === 'GET' && path === '/api/me/today') {
          const activeRooms = repo.listActiveRoomsForUser(userId);
          const todayAssignments: Array<{
            topicId: number;
            roomId: number;
            roomName: string;
            topicText: string;
            kind: string;
            prayedToday: boolean;
            updates?: Array<{ id: number; text: string; createdAt: string }>;
          }> = [];

          for (const room of activeRooms) {
            const topics = repo.listTopics(room.id);
            for (const topic of topics) {
              if (topic.status === 'active') {
                const prayed = repo.hasPrayed(userId, topic.id, today);
                todayAssignments.push({
                  topicId: topic.id,
                  roomId: room.id,
                  roomName: room.name,
                  topicText: topic.text,
                  kind: topic.kind,
                  prayedToday: prayed,
                  updates: repo.listTopicUpdates(topic.id),
                });
              }
            }
          }
          return sendJson(res, 200, todayAssignments);
        }

        // PUT /api/me/reminder or PUT /api/me/settings
        if (method === 'PUT' && (path === '/api/me/reminder' || path === '/api/me/settings')) {
          const body = await parseJsonBody<{ enabled?: boolean; time?: string; locale?: string; theme?: string }>(req);
          if (typeof body.enabled === 'boolean') {
            repo.setReminderEnabled(userId, body.enabled);
          }
          if (typeof body.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) {
            repo.setReminderTime(userId, body.time);
          }
          if (typeof body.locale === 'string' && ['uk', 'en', 'ru'].includes(body.locale)) {
            repo.setUserLocale(userId, body.locale);
          }
          if (typeof body.theme === 'string' && ['auto', 'light', 'dark'].includes(body.theme)) {
            repo.setUserTheme(userId, body.theme);
          }
          return sendJson(res, 200, { ok: true });
        }

        // GET /api/rooms
        if (method === 'GET' && path === '/api/rooms') {
          const userRooms = repo.listRoomsForUser(userId).map(r => ({
            ...r,
            isAdmin: r.adminId === userId,
          }));
          return sendJson(res, 200, userRooms);
        }

        // POST /api/rooms
        if (method === 'POST' && path === '/api/rooms') {
          const body = await parseJsonBody<{ name?: string }>(req);
          if (!body.name) return sendJson(res, 400, { error: 'Room name is required' });
          const resRoom = rooms.createRoom(userId, body.name.trim());
          if (!resRoom.ok) return sendJson(res, 400, { error: resRoom.error });
          return sendJson(res, 201, resRoom.value);
        }

        // POST /api/rooms/join
        if (method === 'POST' && path === '/api/rooms/join') {
          const body = await parseJsonBody<{ code?: string }>(req);
          if (!body.code) return sendJson(res, 400, { error: 'Invite code is required' });
          const resJoin = rooms.joinRoom(userId, body.code.trim());
          if (!resJoin.ok) return sendJson(res, 400, { error: resJoin.error });
          return sendJson(res, 200, resJoin.value);
        }

        // GET /api/rooms/:id
        const roomMatch = path.match(/^\/api\/rooms\/(\d+)$/);
        if (method === 'GET' && roomMatch) {
          const roomId = Number(roomMatch[1]);
          if (!rooms.isRoomMember(userId, roomId)) {
            return sendJson(res, 403, { error: 'Not a member of this room' });
          }
          const room = repo.getRoom(roomId);
          if (!room) return sendJson(res, 404, { error: 'Room not found' });
          const members = repo.listMembers(roomId).map(m => ({
            ...m,
            displayName: repo.getDisplayName(m.telegramId) || `User ${m.telegramId}`,
          }));
          const adminUser = repo.getUserInfo(room.adminId);
          const adminName = adminUser?.displayName || `User ${room.adminId}`;
          const adminUsername = adminUser?.username || null;
          const allTopics = repo.listTopics(roomId);
          const sharedTopics = allTopics.filter(t => t.kind === 'shared').map(t => ({
            ...t,
            updates: repo.listTopicUpdates(t.id),
          }));
          const personalTopics = allTopics.filter(t => t.kind === 'personal').map(t => ({
            ...t,
            authorName: t.isAnonymous ? 'Anonymous' : (repo.getDisplayName(t.ownerId) || `User ${t.ownerId}`),
            updates: repo.listTopicUpdates(t.id),
          }));

          return sendJson(res, 200, {
            ...room,
            adminName,
            adminUsername,
            botUsername: config.botUsername,
            isAdmin: room.adminId === userId,
            members,
            sharedTopics,
            personalTopics,
          });
        }

        // POST /api/rooms/:id/topics
        const roomTopicMatch = path.match(/^\/api\/rooms\/(\d+)\/topics$/);
        if (method === 'POST' && roomTopicMatch) {
          const roomId = Number(roomTopicMatch[1]);
          const body = await parseJsonBody<{ kind?: 'shared' | 'personal'; text?: string; isAnonymous?: boolean }>(req);
          if (!body.text || !body.kind) {
            return sendJson(res, 400, { error: 'Kind and text are required' });
          }
          let result;
          if (body.kind === 'shared') {
            result = rooms.addSharedTopic(userId, roomId, body.text.trim());
          } else {
            result = rooms.addPersonalTopic(userId, roomId, body.text.trim(), !!body.isAnonymous);
          }
          if (!result.ok) return sendJson(res, 400, { error: result.error });
          return sendJson(res, 201, result.value);
        }

        // POST /api/topics/:id/update
        const updateTopicMatch = path.match(/^\/api\/topics\/(\d+)\/update$/);
        if (method === 'POST' && updateTopicMatch) {
          const topicId = Number(updateTopicMatch[1]);
          const body = await parseJsonBody<{ text?: string }>(req);
          if (!body.text) return sendJson(res, 400, { error: 'Update text is required' });
          const result = rooms.postUpdate(userId, topicId, body.text.trim());
          if (!result.ok) return sendJson(res, 400, { error: result.error });
          return sendJson(res, 200, result.value);
        }

        // POST /api/topics/:id/answer
        const answerTopicMatch = path.match(/^\/api\/topics\/(\d+)\/answer$/);
        if (method === 'POST' && answerTopicMatch) {
          const topicId = Number(answerTopicMatch[1]);
          const body = await parseJsonBody<{ text?: string }>(req);
          const result = rooms.markAnswered(userId, topicId, body.text?.trim() || '');
          if (!result.ok) return sendJson(res, 400, { error: result.error });
          return sendJson(res, 200, result.value);
        }

        // POST /api/topics/:id/pray
        const prayTopicMatch = path.match(/^\/api\/topics\/(\d+)\/pray$/);
        if (method === 'POST' && prayTopicMatch) {
          const topicId = Number(prayTopicMatch[1]);
          const topic = repo.getTopic(topicId);
          if (!topic || !rooms.isRoomMember(userId, topic.roomId)) {
            return sendJson(res, 404, { error: 'Topic not found or access denied' });
          }
          repo.recordPrayer(userId, topic.roomId, topicId, today);
          return sendJson(res, 200, { ok: true });
        }

        // POST /api/rooms/:id/leave
        const leaveMatch = path.match(/^\/api\/rooms\/(\d+)\/leave$/);
        if (method === 'POST' && leaveMatch) {
          const roomId = Number(leaveMatch[1]);
          const result = rooms.leaveRoom(userId, roomId);
          if (!result.ok) return sendJson(res, 400, { error: result.error });
          return sendJson(res, 200, { ok: true });
        }

        // POST /api/rooms/:id/close
        const closeMatch = path.match(/^\/api\/rooms\/(\d+)\/close$/);
        if (method === 'POST' && closeMatch) {
          const roomId = Number(closeMatch[1]);
          const result = rooms.closeRoom(userId, roomId);
          if (!result.ok) return sendJson(res, 400, { error: result.error });
          return sendJson(res, 200, { ok: true });
        }

        return sendJson(res, 404, { error: 'API endpoint not found' });
      } catch (err) {
        console.error(`${LOG_PREFIX.server} API error:`, err);
        return sendJson(res, 500, { error: 'Internal server error' });
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(port, () => {
    const addr = server.address();
    const shown = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`${LOG_PREFIX.server} listening on ${shown}`);
  });

  return server;
}
