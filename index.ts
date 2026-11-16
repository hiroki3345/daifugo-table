import { act, initial, view } from './game.mjs';


const lifetime = 24 * 60 * 60 * 1000;
const roomPattern = /^[a-f0-9]{24}$/;
const inviteCode = () => crypto.randomUUID().replaceAll('-', '').slice(0, 24);
const response = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
const problem = (error: string, status = 400) => response({error}, status);
type Env = {DB: D1Database; PAGES_ORIGIN: string};
type Player = {id: string; token: string; name: string; hand: number[]};
type Row = {state: string; revision: number};

function database(env: Env) {
  if (!env.DB) throw new Error('DB unavailable');
  return env.DB.withSession('first-primary');
}

function load(db: ReturnType<typeof database>, id: string) {
  return db.prepare('SELECT state, revision FROM rooms WHERE id = ? AND expires > ?').bind(id, Date.now()).first<Row>();
}

async function get(request: Request, env: Env) {
  const id = new URL(request.url).searchParams.get('room') || '';
  if (!roomPattern.test(id)) return problem('招待リンクを確認してください。');
  const row = await load(database(env), id);
  if (!row) return problem('部屋が見つかりません。', 404);
  const state = JSON.parse(row.state);
  const player = state.players.find((entry: Player) => entry.token === request.headers.get('X-Player'));
  if (!player) return problem('ニックネームを入力して参加してください。', 401);
  return response({state: view(state, player), revision: row.revision});
}

async function post(request: Request, env: Env) {
  let body;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return problem('操作を確認してください。'); }
  if (!body || typeof body !== 'object') return problem('操作を確認してください。');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const db = database(env);
  if (body.action === 'create' || body.action === 'join') {
    if (!name || [...name].length > 16) return problem('ニックネームは1〜16文字で入力してください。');
  }
  const newPlayer: Player = {id: crypto.randomUUID(), token: crypto.randomUUID(), name, hand: []};
  if (body.action === 'create') {
    const id = inviteCode();
    const state = initial(newPlayer);
    await db.batch([
      db.prepare('DELETE FROM rooms WHERE expires <= ?').bind(Date.now()),
      db.prepare('INSERT INTO rooms (id, state, revision, expires) VALUES (?, ?, 0, ?)').bind(id, JSON.stringify(state), Date.now() + lifetime),
    ]);
    return response({room: id, token: newPlayer.token, state: view(state, newPlayer), revision: 0});
  }
  const id = body.room;
  if (typeof id !== 'string' || !roomPattern.test(id)) return problem('招待リンクを確認してください。');
  const row = await load(db, id);
  if (!row) return problem('部屋が見つかりません。', 404);
  const state = JSON.parse(row.state);
  let player: Player;
  if (body.action === 'join') {
    if (state.phase !== 'lobby') return problem('この部屋は対戦を開始しました。');
    if (state.players.length >= 5) return problem('この部屋は満員です。');
    if (state.players.some((entry: Player) => entry.name === name)) return problem('別のニックネームを入力してください。');
    player = newPlayer;
    state.players.push(player);
  } else {
    const authenticated = state.players.find((entry: Player) => entry.token === request.headers.get('X-Player'));
    if (!authenticated) return problem('もう一度部屋に参加してください。', 401);
    player = authenticated;
    if (row.revision !== body.revision) return problem('部屋が更新されました。もう一度操作してください。', 409);
    try { act(state, player, body); }
    catch (error) { return problem(error instanceof Error ? error.message : '操作できません。'); }
  }
  const saved = await db.prepare('UPDATE rooms SET state = ?, revision = revision + 1, expires = ? WHERE id = ? AND revision = ?')
    .bind(JSON.stringify(state), Date.now() + lifetime, id, row.revision).run();
  if (!saved.meta.changes) return problem('部屋が更新されました。もう一度操作してください。', 409);
  return response({room: id, token: player.token, state: view(state, player), revision: row.revision + 1});
}


export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname !== '/api/table') return problem('ページが見つかりません。', 404);
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.PAGES_ORIGIN) return problem('アクセス元を確認してください。', 403);
    const headers = {
      'Access-Control-Allow-Origin': env.PAGES_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Player',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    let result;
    try {
      if (request.method === 'GET') result = await get(request, env);
      else if (request.method === 'POST') result = await post(request, env);
      else result = problem('操作を確認してください。', 405);
    } catch (error) {
      console.error(error);
      result = problem('対戦サーバーに接続できませんでした。', 503);
    }
    for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
    return result;
  },
};
