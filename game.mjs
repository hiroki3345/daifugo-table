export const suits = ['♣', '♦', '♥', '♠'];
export const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export const defaults = { revolution: true, eight: true, stairs: true, lock: false };
export const labels = ['大富豪', '富豪', '平民', '貧民', '大貧民'];

function fail(message) {
  throw new Error(message);
}

export function combination(cards, stairs) {
  if (!cards.length) return null;
  const values = cards.map(card => Math.floor(card / 4)).sort((a, b) => a - b);
  const marks = cards.map(card => card % 4).sort().join('');
  if (values.every(value => value === values[0])) {
    return { type: 'set', low: values[0], high: values[0], marks, size: cards.length };
  }
  if (stairs && cards.length >= 3 && cards.every(card => card % 4 === cards[0] % 4)
    && values.every((value, index) => value === values[0] + index)) {
    return { type: 'stairs', low: values[0], high: values.at(-1), marks, size: cards.length };
  }
  return null;
}

export function legal(cards, state) {
  const play = combination(cards, state.rules.stairs);
  if (!play) return false;
  if (!state.combo) return true;
  if (play.type !== state.combo.type || play.size !== state.combo.size) return false;
  if (state.lock && play.marks !== state.lock) return false;
  return state.reversed ? play.low < state.combo.low : play.high > state.combo.high;
}

export function initial(player) {
  return { host: player.id, players: [player], rules: {...defaults}, phase: 'lobby',
    turn: null, board: [], combo: null, last: null, passed: [], finish: [], reversed: false, lock: '', message: '' };
}

function nextPlayer(state, from, eligible) {
  const start = state.players.findIndex(player => player.id === from);
  for (let step = 1; step <= state.players.length; step++) {
    const player = state.players[(start + step) % state.players.length];
    if (eligible(player)) return player.id;
  }
  return null;
}

function resetBoard(state, leader) {
  state.board = [];
  state.combo = null;
  state.passed = [];
  state.lock = '';
  state.last = null;
  state.turn = state.players.find(player => player.id === leader)?.hand.length
    ? leader : nextPlayer(state, leader, player => player.hand.length);
}

function deal(state) {
  const deck = Array.from({ length: 52 }, (_, index) => index);
  for (let index = deck.length - 1; index > 0; index--) {
    const limit = 2 ** 32 - (2 ** 32 % (index + 1));
    const random = new Uint32Array(1);
    do { crypto.getRandomValues(random); } while (random[0] >= limit);
    const target = random[0] % (index + 1);
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  for (const player of state.players) player.hand = [];
  deck.forEach((card, index) => state.players[index % state.players.length].hand.push(card));
  for (const player of state.players) player.hand.sort((a, b) => a - b);
  state.phase = 'playing';
  state.finish = [];
  state.reversed = false;
  resetBoard(state, state.players.find(player => player.hand.includes(1)).id);
  state.message = '♦3を持つ人からスタート';
}

export function act(state, player, body) {
  if (body.action === 'rules') {
    if (player.id !== state.host || state.phase === 'playing') fail('ルールを変更できません。');
    if (!Object.hasOwn(defaults, body.rule) || typeof body.enabled !== 'boolean') fail('ルールを確認してください。');
    state.rules[body.rule] = body.enabled;
    return;
  }
  if (body.action === 'start') {
    if (player.id !== state.host || state.phase === 'playing' || state.players.length < 3) fail('主催者が3人以上で開始できます。');
    deal(state);
    return;
  }
  if (state.phase !== 'playing' || state.turn !== player.id) fail('自分の番に操作してください。');
  if (body.action === 'pass') {
    if (!state.combo) fail('場が空いているときはカードを出してください。');
    state.passed.push(player.id);
    state.message = player.name + 'がパス';
  } else if (body.action === 'play') {
    const cards = body.cards;
    if (!Array.isArray(cards) || cards.length < 1 || cards.length > player.hand.length
      || new Set(cards).size !== cards.length || !cards.every(card => player.hand.includes(card))
      || !legal(cards, state)) fail('その組み合わせは出せません。');
    const combo = combination(cards, state.rules.stairs);
    if (state.rules.lock && state.combo?.marks === combo.marks) state.lock = combo.marks;
    player.hand = player.hand.filter(card => !cards.includes(card));
    state.board = [...cards].sort((a, b) => a - b);
    state.combo = combo;
    state.last = player.id;
    const notes = [player.name + 'が' + cards.length + '枚出した'];
    if (!player.hand.length) {
      state.finish.push(player.id);
      notes.push('あがり');
    }
    if (state.rules.revolution && (combo.type === 'set' ? combo.size === 4 : combo.size >= 5)) {
      state.reversed = !state.reversed;
      notes.push(state.reversed ? '革命' : '革命返し');
    }
    state.message = notes.join(' ・ ');
    const remaining = state.players.filter(member => member.hand.length);
    if (remaining.length === 1) {
      state.finish.push(remaining[0].id);
      state.phase = 'finished';
      state.turn = null;
      return;
    }
    if (state.rules.eight && cards.some(card => Math.floor(card / 4) === 5)) {
      state.message += ' ・ 8切り';
      resetBoard(state, player.id);
      return;
    }
  } else {
    fail('操作を確認してください。');
  }
  const next = nextPlayer(state, player.id, member =>
    member.hand.length && !state.passed.includes(member.id) && member.id !== state.last);
  if (next) state.turn = next;
  else {
    resetBoard(state, state.last);
    state.message += ' ・ 場が流れました';
  }
}

export function view(state, player) {
  const {players, ...table} = state;
  return {...table, self: player.id, hand: player.hand, players: players.map(({id, name, hand}) => ({
    id, name, count: hand.length,
  }))};
}
