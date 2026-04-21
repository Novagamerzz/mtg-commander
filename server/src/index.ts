import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { randomUUID } from 'crypto';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  HealthResponse,
  PersonalGameState,
  PersonalPlayerState,
  GameCard,
  TurnPhase,
  Room,
} from './types';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Accept the Vercel client in production; fall back to local dev.
const ALLOWED_ORIGINS: string[] = [
  'http://localhost:5173',
  'https://mtg-commander-client-drab.vercel.app',
];
if (process.env.CLIENT_URL) ALLOWED_ORIGINS.push(process.env.CLIENT_URL.trim());

// ── Internal types (server-only, not sent to clients) ─────────────────────────

interface InternalCard {
  instanceId: string; scryfallId: string;
  name: string; imageUri: string; typeLine: string; oracleText: string; tapped: boolean;
  counters?: Record<string, number>;
  powerOverride?: string | null;
  toughnessOverride?: string | null;
  isCommander?: boolean;
}

interface InternalPlayer {
  socketId: string; userId: string; playerName: string;
  life: number;
  commanderDamage: Record<string, number>;
  poisonCounters: number;
  commandZone: InternalCard[];
  hand: InternalCard[];
  battlefield: InternalCard[];
  graveyard: InternalCard[];
  exile: InternalCard[];
  library: InternalCard[];
  commanderCastCount: number;
  landsPlayedThisTurn: number;
  eliminated: boolean;
  mulliganCount: number;
  mulliganReady: boolean;
  mulliganScryPending: boolean;
}

interface InternalGame {
  roomId: string;
  players: InternalPlayer[];
  turnOrder: string[];
  activePlayerIndex: number;
  phase: TurnPhase;
  turn: number;
  log: string[];
  pendingElimination: { socketId: string; playerName: string; reason: string } | null;
  mulliganPhase: boolean;
  monarchSocketId: string | null;
}

interface InternalRoomPlayer {
  socketId: string; userId: string; playerName: string;
  deckId: string | null; deckName: string | null;
  deckCards: {
    scryfallId: string; cardName: string; imageUri: string;
    typeLine: string; oracleText: string; quantity: number; isCommander: boolean;
  }[];
}

interface InternalRoom {
  id: string; hostSocketId: string; hostName: string;
  players: InternalRoomPlayer[];
  status: 'waiting' | 'in_progress';
  createdAt: number;
  password?: string;
}

// ── State ─────────────────────────────────────────────────────────────────────

const rooms = new Map<string, InternalRoom>();
const games = new Map<string, InternalGame>();
const socketToRoom = new Map<string, string>();
const userIdToRoom = new Map<string, string>(); // survives socket reconnects

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => {
  const body: HealthResponse = { status: 'ok', uptime: process.uptime(), timestamp: Date.now() };
  res.json(body);
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'], credentials: true },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function appendLog(game: InternalGame, entry: string) {
  game.log.unshift(entry);
  if (game.log.length > 30) game.log.pop();
}

function toPublicRoom(room: InternalRoom): Room {
  return {
    id: room.id,
    hostSocketId: room.hostSocketId,
    hostName: room.hostName,
    players: room.players.map((p) => ({
      socketId: p.socketId,
      playerName: p.playerName,
      deckId: p.deckId,
      deckName: p.deckName,
      ready: !!p.deckId && p.deckCards.length > 0,
    })),
    status: room.status,
    createdAt: room.createdAt,
    hasPassword: !!room.password,
    password: room.password, // visible in room state so host can share it
  };
}

function toPersonalState(game: InternalGame, mySocketId: string): PersonalGameState {
  return {
    roomId: game.roomId,
    mySocketId,
    turnOrder: game.turnOrder,
    activePlayerIndex: game.activePlayerIndex,
    phase: game.phase,
    turn: game.turn,
    log: game.log,
    pendingElimination: game.pendingElimination,
    mulliganPhase: game.mulliganPhase,
    monarchSocketId: game.monarchSocketId,
    players: game.players.map((p, i): PersonalPlayerState => ({
      socketId: p.socketId,
      playerName: p.playerName,
      life: p.life,
      commanderDamage: p.commanderDamage,
      poisonCounters: p.poisonCounters,
      commandZone: p.commandZone as GameCard[],
      hand: p.socketId === mySocketId ? (p.hand as GameCard[]) : [],
      handCount: p.hand.length,
      battlefield: p.battlefield as GameCard[],
      graveyard: p.graveyard as GameCard[],
      exile: p.exile as GameCard[],
      libraryCount: p.library.length,
      isActive: i === game.activePlayerIndex,
      commanderCastCount: p.commanderCastCount,
      landsPlayedThisTurn: p.landsPlayedThisTurn,
      eliminated: p.eliminated,
      mulliganCount: p.mulliganCount,
      mulliganReady: p.mulliganReady,
    })),
  };
}

function broadcastLobby() {
  const publicRooms = [...rooms.values()]
    .filter((r) => r.status === 'waiting')
    .map(toPublicRoom);
  io.to('lobby').emit('lobby:rooms', publicRooms);
}

function broadcastRoom(room: InternalRoom) {
  io.to(room.id).emit('room:updated', toPublicRoom(room));
}

function broadcastGame(game: InternalGame) {
  for (const player of game.players) {
    io.to(player.socketId).emit('game:state', toPersonalState(game, player.socketId));
  }
}

function createGame(room: InternalRoom): InternalGame {
  const players: InternalPlayer[] = room.players.map((rp) => {
    const commanderData = rp.deckCards.find((c) => c.isCommander);
    const libraryData = rp.deckCards.filter((c) => !c.isCommander);

    const libraryCards: InternalCard[] = shuffle(
      libraryData.flatMap((dc) =>
        Array.from({ length: dc.quantity }, () => ({
          instanceId: randomUUID(),
          scryfallId: dc.scryfallId,
          name: dc.cardName,
          imageUri: dc.imageUri,
          typeLine: dc.typeLine,
          oracleText: dc.oracleText ?? '',
          tapped: false,
        }))
      )
    );

    const hand = libraryCards.splice(0, 7);

    const commandZone: InternalCard[] = commanderData
      ? [{
          instanceId: randomUUID(),
          scryfallId: commanderData.scryfallId,
          name: commanderData.cardName,
          imageUri: commanderData.imageUri,
          typeLine: commanderData.typeLine,
          oracleText: commanderData.oracleText ?? '',
          tapped: false,
          isCommander: true,
        }]
      : [];

    const commanderDamage: Record<string, number> = {};
    room.players.forEach((p) => {
      if (p.socketId !== rp.socketId) commanderDamage[p.socketId] = 0;
    });

    return {
      socketId: rp.socketId,
      userId: rp.userId,
      playerName: rp.playerName,
      life: 40,
      commanderDamage,
      poisonCounters: 0,
      commandZone,
      hand,
      battlefield: [],
      graveyard: [],
      exile: [],
      library: libraryCards,
      commanderCastCount: 0,
      landsPlayedThisTurn: 0,
      eliminated: false,
      mulliganCount: 0,
      mulliganReady: false,
      mulliganScryPending: false,
    };
  });

  return {
    roomId: room.id,
    players,
    turnOrder: players.map((p) => p.socketId),
    activePlayerIndex: 0,
    phase: 'untap',
    turn: 1,
    log: [`Game created — mulligan phase. ${players[0].playerName} goes first.`],
    pendingElimination: null,
    mulliganPhase: true,
    monarchSocketId: null,
  };
}

const PHASE_ORDER: TurnPhase[] = ['untap', 'upkeep', 'draw', 'main1', 'combat', 'main2', 'end'];

function advancePhase(game: InternalGame) {
  const idx = PHASE_ORDER.indexOf(game.phase);
  if (idx >= PHASE_ORDER.length - 1) {
    advanceTurn(game);
    return;
  }
  game.phase = PHASE_ORDER[idx + 1];
  const active = game.players[game.activePlayerIndex];

  if (game.phase === 'draw') {
    if (active.library.length > 0) {
      active.hand.push(active.library.shift()!);
      appendLog(game, `${active.playerName} drew (draw step)`);
    }
  }
}

function checkAllMulliganReady(game: InternalGame) {
  if (game.players.every((p) => p.mulliganReady)) {
    game.mulliganPhase = false;
    appendLog(game, `— Turn 1: ${game.players[game.activePlayerIndex].playerName} —`);
  }
}

function advanceTurn(game: InternalGame) {
  const total = game.players.length;
  let next = (game.activePlayerIndex + 1) % total;
  let guard = 0;
  while (game.players[next].eliminated && guard < total) {
    appendLog(game, `${game.players[next].playerName} was eliminated — turn skipped`);
    next = (next + 1) % total;
    guard++;
  }
  game.activePlayerIndex = next;
  game.turn++;
  game.phase = 'untap';

  const active = game.players[game.activePlayerIndex];
  for (const card of active.battlefield) card.tapped = false;
  active.landsPlayedThisTurn = 0;
  appendLog(game, `— Turn ${game.turn}: ${active.playerName} —`);
}

function moveCard(
  from: InternalCard[], to: InternalCard[], instanceId: string
): InternalCard | null {
  const idx = from.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) return null;
  const [card] = from.splice(idx, 1);
  card.tapped = false;
  to.push(card);
  return card;
}

// ── Timing enforcement ────────────────────────────────────────────────────────

const PHASE_NAMES: Record<string, string> = {
  untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw',
  combat: 'Combat', end: 'End Step',
};

function checkPlayTiming(game: InternalGame, player: InternalPlayer, card: InternalCard): string | null {
  const typeLine  = card.typeLine ?? '';
  const oracle    = (card.oracleText ?? '').toLowerCase();

  // Instant speed: type is Instant, OR card has the Flash keyword in oracle text
  const isInstant = typeLine.includes('Instant') || oracle.includes('flash');
  if (isInstant) return null; // Always legal

  // Everything else is sorcery speed
  const isYourTurn = game.turnOrder[game.activePlayerIndex] === player.socketId;

  if (!isYourTurn) {
    return `You can only play instants right now — it's ${
      game.players.find((p) => p.socketId === game.turnOrder[game.activePlayerIndex])?.playerName ?? 'another player'
    }'s turn.`;
  }

  const phase = game.phase;
  if (phase !== 'main1' && phase !== 'main2') {
    const phaseName = PHASE_NAMES[phase] ?? phase;
    return `You can only play this during your Main Phase (currently ${phaseName}). Instants can be played at any time.`;
  }

  // Land drop — one per turn
  if (typeLine.includes('Land')) {
    if (player.landsPlayedThisTurn >= 1) {
      return "You've already played a land this turn. You can only play one land per turn.";
    }
  }

  return null; // All checks passed
}

// ── Socket handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // ─── Lobby ──────────────────────────────────────────────────────────────────

  socket.on('lobby:subscribe', () => {
    socket.join('lobby');
    const publicRooms = [...rooms.values()].filter((r) => r.status === 'waiting').map(toPublicRoom);
    socket.emit('lobby:rooms', publicRooms);
  });

  socket.on('lobby:create_room', ({ playerName, userId, password }) => {
    const roomId = randomUUID();
    const room: InternalRoom = {
      id: roomId,
      hostSocketId: socket.id,
      hostName: playerName,
      players: [{ socketId: socket.id, userId, playerName, deckId: null, deckName: null, deckCards: [] }],
      status: 'waiting',
      createdAt: Date.now(),
      password: password?.trim() || undefined,
    };
    rooms.set(roomId, room);
    socketToRoom.set(socket.id, roomId);
    userIdToRoom.set(userId, roomId);
    socket.leave('lobby');
    socket.join(roomId);
    socket.emit('room:updated', toPublicRoom(room));
    broadcastLobby();
    console.log(`[room:create] ${playerName} → ${roomId}`);
  });

  socket.on('lobby:join_room', ({ roomId, playerName, userId, password }) => {
    const room = rooms.get(roomId);
    if (!room || room.status === 'in_progress' || room.players.length >= 4) {
      socket.emit('room:error', 'Cannot join this room.');
      return;
    }
    if (room.password && room.password !== password?.trim()) {
      socket.emit('room:error', 'Incorrect password.');
      return;
    }
    if (room.players.some((p) => p.socketId === socket.id)) {
      socket.emit('room:updated', toPublicRoom(room));
      return;
    }
    room.players.push({ socketId: socket.id, userId, playerName, deckId: null, deckName: null, deckCards: [] });
    socketToRoom.set(socket.id, roomId);
    userIdToRoom.set(userId, roomId);
    socket.leave('lobby');
    socket.join(roomId);
    broadcastRoom(room);
    broadcastLobby();
    console.log(`[room:join] ${playerName} → ${roomId}`);
  });

  // ─── Room ────────────────────────────────────────────────────────────────────

  socket.on('room:select_deck', ({ deckId, deckName, cards }) => {
    const roomId = socketToRoom.get(socket.id);
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.deckId = deckId;
    player.deckName = deckName;
    player.deckCards = cards;
    broadcastRoom(room);
  });

  socket.on('room:start_game', () => {
    const roomId = socketToRoom.get(socket.id);
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.players.length < 2) {
      socket.emit('room:error', 'Need at least 2 players to start.');
      return;
    }
    if (room.players.some((p) => !p.deckId || p.deckCards.length === 0)) {
      socket.emit('room:error', 'All players must select a deck.');
      return;
    }
    room.status = 'in_progress';
    // Shuffle seating so first player is random
    room.players = shuffle(room.players);
    const game = createGame(room);
    games.set(roomId!, game);
    const firstPlayerName = game.players[0].playerName;
    // Announce the first player to everyone in the room before the game state arrives
    io.to(roomId!).emit('game:first_player', { playerName: firstPlayerName });
    broadcastGame(game);
    broadcastLobby();
    console.log(`[game:start] room ${roomId} — ${room.players.length} players, ${firstPlayerName} goes first`);
  });

  socket.on('room:leave', () => {
    cleanupSocket(socket.id);
  });

  // ─── Game ────────────────────────────────────────────────────────────────────

  socket.on('game:rejoin', (payload) => {
    // Try direct lookup first (same socket ID as before)
    let roomId = socketToRoom.get(socket.id);

    // Fallback: find by userId when socket ID changed after reconnect
    if (!roomId && payload?.userId) {
      roomId = userIdToRoom.get(payload.userId);
      if (roomId) {
        // Re-bind the new socket ID
        socketToRoom.set(socket.id, roomId);
        const game = games.get(roomId);
        if (game) {
          const player = game.players.find((p) => p.userId === payload.userId);
          if (player) {
            // Remove stale socket mapping and update player's socket ID
            socketToRoom.delete(player.socketId);
            player.socketId = socket.id;
            socket.join(roomId);
            console.log(`[game:rejoin] ${player.playerName} re-bound ${socket.id}`);
          }
        }
      }
    }

    const game = roomId ? games.get(roomId) : undefined;
    if (game) {
      socket.emit('game:state', toPersonalState(game, socket.id));
    }
  });

  socket.on('game:draw_card', () => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || player.library.length === 0) return;
    player.hand.push(player.library.shift()!);
    appendLog(game, `${player.playerName} drew a card`);
    broadcastGame(game);
  });

  socket.on('game:play_card', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const card = player.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;

    const timingError = checkPlayTiming(game, player, card);
    if (timingError) {
      socket.emit('game:error', timingError);
      return;
    }

    const played = moveCard(player.hand, player.battlefield, instanceId);
    if (!played) return;

    if (played.typeLine.includes('Land')) {
      player.landsPlayedThisTurn++;
    }

    appendLog(game, `${player.playerName} played ${played.name}`);
    broadcastGame(game);
  });

  socket.on('game:tap_card', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const card = player.battlefield.find((c) => c.instanceId === instanceId);
    if (card) { card.tapped = !card.tapped; broadcastGame(game); }
  });

  socket.on('game:end_phase', () => {
    const game = getGame(socket.id);
    if (!game || game.turnOrder[game.activePlayerIndex] !== socket.id) return;
    advancePhase(game);
    broadcastGame(game);
  });

  socket.on('game:end_turn', () => {
    const game = getGame(socket.id);
    if (!game || game.turnOrder[game.activePlayerIndex] !== socket.id) return;
    advanceTurn(game);
    broadcastGame(game);
  });

  socket.on('game:update_life', ({ delta }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || player.eliminated) return;
    const prevLife = player.life;
    player.life = Math.max(0, player.life + delta);
    appendLog(game, `${player.playerName}: life → ${player.life}`);
    if (prevLife > 0 && player.life <= 0 && !game.pendingElimination) {
      game.pendingElimination = { socketId: player.socketId, playerName: player.playerName, reason: `Life: ${player.life}` };
    }
    broadcastGame(game);
  });

  socket.on('game:update_commander_damage', ({ fromSocketId, delta }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const prev = player.commanderDamage[fromSocketId] ?? 0;
    const next = Math.max(0, prev + delta);
    const actualDelta = next - prev; // may differ from delta if clamped at 0
    if (actualDelta === 0) return;

    player.commanderDamage[fromSocketId] = next;

    // Automatically apply commander damage as life loss (positive delta = damage dealt)
    player.life = Math.max(0, player.life - actualDelta);
    appendLog(game, `${player.playerName}: ${actualDelta > 0 ? `−${actualDelta}` : `+${-actualDelta}`} from commander damage → life ${player.life}`);

    if (next >= 21 && prev < 21 && !player.eliminated && !game.pendingElimination) {
      const attacker = game.players.find((p) => p.socketId === fromSocketId);
      const cmdName = (attacker?.commandZone[0]?.name ?? attacker?.playerName ?? 'Unknown').split(',')[0];
      game.pendingElimination = {
        socketId: player.socketId, playerName: player.playerName,
        reason: `21 commander damage from ${cmdName}`,
      };
    }

    broadcastGame(game);
  });

  socket.on('game:move_to_graveyard', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    for (const zone of [player.battlefield, player.hand, player.exile]) {
      const card = moveCard(zone, player.graveyard, instanceId);
      if (card) { appendLog(game, `${player.playerName}: ${card.name} → graveyard`); broadcastGame(game); return; }
    }
  });

  socket.on('game:move_to_exile', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    for (const zone of [player.battlefield, player.hand, player.graveyard]) {
      const card = moveCard(zone, player.exile, instanceId);
      if (card) { appendLog(game, `${player.playerName}: ${card.name} → exile`); broadcastGame(game); return; }
    }
  });

  socket.on('game:return_commander', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    for (const zone of [player.graveyard, player.exile, player.battlefield]) {
      const card = moveCard(zone, player.commandZone, instanceId);
      if (card) { appendLog(game, `${player.playerName}: ${card.name} → command zone`); broadcastGame(game); return; }
    }
  });

  // ─── Three new handlers ───────────────────────────────────────────────────────

  socket.on('game:cast_commander', () => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || player.commandZone.length === 0) return;

    const commander = player.commandZone[0];
    const timingError = checkPlayTiming(game, player, commander);
    if (timingError) {
      socket.emit('game:error', `Commander: ${timingError}`);
      return;
    }

    const [castCard] = player.commandZone.splice(0, 1);
    player.battlefield.push(castCard);
    const commander_ref = castCard; // alias for log below
    const tax = player.commanderCastCount * 2;
    player.commanderCastCount++;
    const taxNote = tax > 0 ? ` (paid +${tax} commander tax)` : '';
    appendLog(game, `${player.playerName} cast ${commander_ref.name}${taxNote}`);
    broadcastGame(game);
  });

  socket.on('game:move_to_hand', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    for (const zone of [player.battlefield, player.graveyard, player.exile]) {
      const card = moveCard(zone, player.hand, instanceId);
      if (card) { appendLog(game, `${player.playerName}: ${card.name} → hand`); broadcastGame(game); return; }
    }
  });

  socket.on('game:return_to_battlefield', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    for (const zone of [player.graveyard, player.exile]) {
      const card = moveCard(zone, player.battlefield, instanceId);
      if (card) { appendLog(game, `${player.playerName}: ${card.name} → battlefield`); broadcastGame(game); return; }
    }
  });

  socket.on('game:request_library', () => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    // Send library only to requesting socket — private to that player
    socket.emit('game:library_contents', player.library as GameCard[]);
  });

  socket.on('game:update_counter', ({ instanceId, counter, delta }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const card = player.battlefield.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (!card.counters) card.counters = {};
    card.counters[counter] = Math.max(0, (card.counters[counter] ?? 0) + delta);
    if (card.counters[counter] === 0) delete card.counters[counter];
    if (delta !== 0) {
      appendLog(game, `${player.playerName}: ${card.name} ${delta > 0 ? '+' : ''}${delta} ${counter} counter`);
      broadcastGame(game);
    }
  });

  socket.on('game:set_pt', ({ instanceId, power, toughness }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const card = player.battlefield.find((c) => c.instanceId === instanceId);
    if (!card) return;
    card.powerOverride = power || null;
    card.toughnessOverride = toughness || null;
    if (power || toughness) {
      appendLog(game, `${player.playerName}: ${card.name} P/T set to ${power || '?'}/${toughness || '?'}`);
    }
    broadcastGame(game);
  });

  socket.on('game:shuffle_library', () => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.library = shuffle(player.library);
    appendLog(game, `${player.playerName} shuffled their library`);
    broadcastGame(game);
  });

  socket.on('game:scry', ({ count }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const n = Math.min(Math.max(1, Math.floor(count)), player.library.length);
    if (n === 0) return;
    socket.emit('game:scry_cards', player.library.slice(0, n) as GameCard[]);
    appendLog(game, `${player.playerName} scryed ${n}`);
    broadcastGame(game);
  });

  socket.on('game:scry_resolve', ({ keepOnTop, putOnBottom }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const scryCount = keepOnTop.length + putOnBottom.length;
    const scryed = player.library.splice(0, scryCount);
    const top = keepOnTop.map((id) => scryed.find((c) => c.instanceId === id)).filter(Boolean) as typeof scryed;
    const bot = putOnBottom.map((id) => scryed.find((c) => c.instanceId === id)).filter(Boolean) as typeof scryed;
    player.library = [...top, ...player.library, ...bot];
    if (game.mulliganPhase && player.mulliganScryPending) {
      player.mulliganScryPending = false;
      player.mulliganReady = true;
      checkAllMulliganReady(game);
    }
    broadcastGame(game);
  });

  socket.on('game:create_token', ({ name, power, toughness, color, typeLine, imageUri }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const token: InternalCard = {
      instanceId: randomUUID(),
      scryfallId: `token-${randomUUID()}`,
      name,
      imageUri: imageUri ?? '',
      typeLine,
      oracleText: power && toughness ? `${power}/${toughness}` : '',
      tapped: false,
    };
    player.battlefield.push(token);
    appendLog(game, `${player.playerName} created ${name} token (${power}/${toughness})`);
    broadcastGame(game);
  });

  socket.on('game:copy_card', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    // Search battlefield for the card to copy
    const source =
      player.battlefield.find((c) => c.instanceId === instanceId) ??
      player.commandZone.find((c) => c.instanceId === instanceId);
    if (!source) return;
    const copy: InternalCard = { ...source, instanceId: randomUUID(), tapped: false, counters: {}, powerOverride: null, toughnessOverride: null };
    player.battlefield.push(copy);
    appendLog(game, `${player.playerName} copied ${source.name} onto the battlefield`);
    broadcastGame(game);
  });

  socket.on('game:tutor', ({ instanceId, to }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const idx = player.library.findIndex((c) => c.instanceId === instanceId);
    if (idx === -1) return;
    const [card] = player.library.splice(idx, 1);
    player.library = shuffle(player.library); // shuffle after tutoring
    if (to === 'hand') {
      player.hand.push(card);
      appendLog(game, `${player.playerName} tutored ${card.name} → hand`);
    } else {
      player.battlefield.push(card);
      appendLog(game, `${player.playerName} put ${card.name} onto the battlefield`);
    }
    broadcastGame(game);
  });

  socket.on('game:confirm_elimination', ({ targetSocketId }) => {
    const game = getGame(socket.id);
    if (!game || game.pendingElimination?.socketId !== targetSocketId) return;
    const target = game.players.find((p) => p.socketId === targetSocketId);
    if (!target || target.eliminated) return;

    target.eliminated = true;
    // Move all battlefield cards to graveyard
    target.graveyard.push(...target.battlefield);
    target.battlefield = [];
    game.pendingElimination = null;
    appendLog(game, `${target.playerName} has been eliminated!`);

    // If it was their turn, advance to next alive player
    if (game.players[game.activePlayerIndex].socketId === targetSocketId) {
      advanceTurn(game);
    }

    // Check win condition
    const alive = game.players.filter((p) => !p.eliminated);
    let msg: string;
    if (alive.length <= 1) {
      msg = alive.length === 1 ? `🏆 ${alive[0].playerName} wins!` : '🏆 Game over!';
      appendLog(game, msg);
    } else {
      msg = `💀 ${target.playerName} has been eliminated!`;
    }
    for (const p of game.players) {
      io.to(p.socketId).emit('game:announcement', { message: msg, type: alive.length <= 1 ? 'info' : 'defeat' });
    }

    broadcastGame(game);
  });

  socket.on('game:cancel_elimination', () => {
    const game = getGame(socket.id);
    if (!game || !game.pendingElimination) return;
    appendLog(game, `Elimination of ${game.pendingElimination.playerName} was undone`);
    game.pendingElimination = null;
    broadcastGame(game);
  });

  socket.on('game:mulligan', () => {
    const game = getGame(socket.id);
    if (!game || !game.mulliganPhase) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || player.mulliganReady) return;
    player.library = shuffle([...player.hand, ...player.library]);
    player.hand = [];
    player.mulliganCount++;
    const drawCount = Math.max(0, 7 - player.mulliganCount);
    player.hand = player.library.splice(0, drawCount);
    appendLog(game, `${player.playerName} took a mulligan (draw ${drawCount})`);
    broadcastGame(game);
  });

  socket.on('game:mulligan_keep', () => {
    const game = getGame(socket.id);
    if (!game || !game.mulliganPhase) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || player.mulliganReady) return;
    if (player.mulliganCount > 0) {
      player.mulliganScryPending = true;
      socket.emit('game:scry_cards', player.library.slice(0, 1) as GameCard[]);
      appendLog(game, `${player.playerName} kept their hand (London scry 1)`);
    } else {
      player.mulliganReady = true;
      appendLog(game, `${player.playerName} kept their opening hand`);
      checkAllMulliganReady(game);
    }
    broadcastGame(game);
  });

  socket.on('game:concede', () => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || player.eliminated) return;
    player.eliminated = true;
    player.graveyard.push(...player.battlefield);
    player.battlefield = [];
    if (game.pendingElimination?.socketId === socket.id) game.pendingElimination = null;
    appendLog(game, `${player.playerName} has conceded`);
    if (game.players[game.activePlayerIndex].socketId === socket.id) advanceTurn(game);
    const alive = game.players.filter((p) => !p.eliminated);
    let msg: string;
    if (alive.length === 0) {
      msg = '🤝 The game ends — no winner.';
      appendLog(game, msg);
    } else if (alive.length === 1) {
      msg = `🏆 ${alive[0].playerName} wins!`;
      appendLog(game, msg);
    } else {
      msg = `💀 ${player.playerName} has conceded!`;
    }
    for (const p of game.players) {
      io.to(p.socketId).emit('game:announcement', { message: msg, type: alive.length <= 1 ? 'info' : 'defeat' });
    }
    broadcastGame(game);
  });

  socket.on('game:mill', ({ count }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const n = Math.min(Math.max(1, Math.floor(count)), player.library.length);
    if (n === 0) return;
    const milled = player.library.splice(0, n);
    player.graveyard.push(...milled);
    socket.emit('game:mill_result', milled as GameCard[]);
    appendLog(game, `${player.playerName} milled ${n} card${n !== 1 ? 's' : ''}`);
    broadcastGame(game);
  });

  socket.on('game:roll_dice', ({ sides }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    const validSides = [4, 6, 8, 10, 12, 20];
    const s = validSides.includes(sides) ? sides : 20;
    const result = Math.floor(Math.random() * s) + 1;
    appendLog(game, `${player.playerName} rolled a d${s} and got ${result}!`);
    for (const p of game.players) {
      io.to(p.socketId).emit('game:dice_result', { playerName: player.playerName, sides: s, result });
    }
    broadcastGame(game);
  });

  socket.on('game:claim_monarch', () => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || player.eliminated) return;
    const prev = game.monarchSocketId ? game.players.find((p) => p.socketId === game.monarchSocketId)?.playerName : null;
    game.monarchSocketId = socket.id;
    appendLog(game, prev
      ? `${player.playerName} took the monarch from ${prev}!`
      : `${player.playerName} became the monarch!`);
    broadcastGame(game);
  });

  socket.on('game:update_poison', ({ delta }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player || player.eliminated) return;
    const prev = player.poisonCounters;
    player.poisonCounters = Math.max(0, prev + delta);
    appendLog(game, `${player.playerName}: poison → ${player.poisonCounters}`);
    if (prev < 10 && player.poisonCounters >= 10 && !game.pendingElimination) {
      game.pendingElimination = { socketId: player.socketId, playerName: player.playerName, reason: `Poison counters: ${player.poisonCounters}` };
    }
    broadcastGame(game);
  });

  socket.on('game:give_control', ({ instanceId, targetSocketId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const fromPlayer = game.players.find((p) => p.socketId === socket.id);
    const toPlayer   = game.players.find((p) => p.socketId === targetSocketId);
    if (!fromPlayer || !toPlayer) return;
    const card = moveCard(fromPlayer.battlefield, toPlayer.battlefield, instanceId);
    if (card) {
      appendLog(game, `${fromPlayer.playerName} gave ${card.name} to ${toPlayer.playerName}`);
      broadcastGame(game);
    }
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    cleanupSocket(socket.id);
    console.log(`[-] ${socket.id}`);
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function getGame(socketId: string): InternalGame | undefined {
    const roomId = socketToRoom.get(socketId);
    return roomId ? games.get(roomId) : undefined;
  }
});

function cleanupSocket(socketId: string) {
  const roomId = socketToRoom.get(socketId);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room && room.status === 'waiting') {
    room.players = room.players.filter((p) => p.socketId !== socketId);
    if (room.players.length === 0) {
      rooms.delete(roomId);
    } else {
      if (room.hostSocketId === socketId) {
        room.hostSocketId = room.players[0].socketId;
        room.hostName = room.players[0].playerName;
      }
      broadcastRoom(room);
    }
    broadcastLobby();
  }

  const game = games.get(roomId);
  if (game) {
    const player = game.players.find((p) => p.socketId === socketId);
    if (player) {
      appendLog(game, `${player.playerName} disconnected`);
      broadcastGame(game);
    }
  }

  socketToRoom.delete(socketId);
}

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} — allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
