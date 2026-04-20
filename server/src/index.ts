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
} from '@mtg-commander/types';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

// ── Internal types (server-only, not sent to clients) ─────────────────────────

interface InternalCard {
  instanceId: string; scryfallId: string;
  name: string; imageUri: string; typeLine: string; tapped: boolean;
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
}

interface InternalGame {
  roomId: string;
  players: InternalPlayer[];
  turnOrder: string[];
  activePlayerIndex: number;
  phase: TurnPhase;
  turn: number;
  log: string[];
}

interface InternalRoomPlayer {
  socketId: string; userId: string; playerName: string;
  deckId: string | null; deckName: string | null;
  deckCards: {
    scryfallId: string; cardName: string; imageUri: string;
    typeLine: string; quantity: number; isCommander: boolean;
  }[];
}

interface InternalRoom {
  id: string; hostSocketId: string; hostName: string;
  players: InternalRoomPlayer[];
  status: 'waiting' | 'in_progress';
  createdAt: number;
}

// ── State ─────────────────────────────────────────────────────────────────────

const rooms = new Map<string, InternalRoom>();
const games = new Map<string, InternalGame>();
const socketToRoom = new Map<string, string>();

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  const body: HealthResponse = { status: 'ok', uptime: process.uptime(), timestamp: Date.now() };
  res.json(body);
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
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
          tapped: false,
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
    };
  });

  return {
    roomId: room.id,
    players,
    turnOrder: players.map((p) => p.socketId),
    activePlayerIndex: 0,
    phase: 'untap',
    turn: 1,
    log: [`Game started! ${players[0].playerName} goes first.`],
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

function advanceTurn(game: InternalGame) {
  game.activePlayerIndex = (game.activePlayerIndex + 1) % game.players.length;
  game.turn++;
  game.phase = 'untap';

  const active = game.players[game.activePlayerIndex];
  for (const card of active.battlefield) card.tapped = false;
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

// ── Socket handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // ─── Lobby ──────────────────────────────────────────────────────────────────

  socket.on('lobby:subscribe', () => {
    socket.join('lobby');
    const publicRooms = [...rooms.values()].filter((r) => r.status === 'waiting').map(toPublicRoom);
    socket.emit('lobby:rooms', publicRooms);
  });

  socket.on('lobby:create_room', ({ playerName, userId }) => {
    const roomId = randomUUID();
    const room: InternalRoom = {
      id: roomId,
      hostSocketId: socket.id,
      hostName: playerName,
      players: [{ socketId: socket.id, userId, playerName, deckId: null, deckName: null, deckCards: [] }],
      status: 'waiting',
      createdAt: Date.now(),
    };
    rooms.set(roomId, room);
    socketToRoom.set(socket.id, roomId);
    socket.leave('lobby');
    socket.join(roomId);
    socket.emit('room:updated', toPublicRoom(room));
    broadcastLobby();
    console.log(`[room:create] ${playerName} → ${roomId}`);
  });

  socket.on('lobby:join_room', ({ roomId, playerName, userId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status === 'in_progress' || room.players.length >= 4) {
      socket.emit('room:error', 'Cannot join this room.');
      return;
    }
    if (room.players.some((p) => p.socketId === socket.id)) {
      socket.emit('room:updated', toPublicRoom(room));
      return;
    }
    room.players.push({ socketId: socket.id, userId, playerName, deckId: null, deckName: null, deckCards: [] });
    socketToRoom.set(socket.id, roomId);
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
    const game = createGame(room);
    games.set(roomId, game);
    broadcastGame(game);
    broadcastLobby();
    console.log(`[game:start] room ${roomId} — ${room.players.length} players`);
  });

  socket.on('room:leave', () => {
    cleanupSocket(socket.id);
  });

  // ─── Game ────────────────────────────────────────────────────────────────────

  socket.on('game:rejoin', () => {
    const roomId = socketToRoom.get(socket.id);
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
    const card = moveCard(player.hand, player.battlefield, instanceId);
    if (card) {
      appendLog(game, `${player.playerName} played ${card.name}`);
      broadcastGame(game);
    }
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
    if (!player) return;
    player.life = Math.max(0, player.life + delta);
    appendLog(game, `${player.playerName}: life → ${player.life}`);
    broadcastGame(game);
  });

  socket.on('game:update_commander_damage', ({ fromSocketId, delta }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.commanderDamage[fromSocketId] = Math.max(
      0, (player.commanderDamage[fromSocketId] ?? 0) + delta
    );
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
    const [commander] = player.commandZone.splice(0, 1);
    player.battlefield.push(commander);
    const tax = player.commanderCastCount * 2;
    player.commanderCastCount++;
    const taxNote = tax > 0 ? ` (paid +${tax} commander tax)` : '';
    appendLog(game, `${player.playerName} cast ${commander.name}${taxNote}`);
    broadcastGame(game);
  });

  socket.on('game:move_to_hand', ({ instanceId }) => {
    const game = getGame(socket.id);
    if (!game) return;
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    for (const zone of [player.graveyard, player.exile]) {
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
  console.log(`Server listening on http://localhost:${PORT}`);
});
