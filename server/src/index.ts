import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  HealthResponse,
  Player,
} from '@mtg-commander/types';

const PORT = 3001;
const CLIENT_ORIGIN = 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  };
  res.json(body);
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

// ── In-memory player registry (replace with real state manager later) ─────────
const connectedPlayers = new Map<string, Player>();

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on('game:join', ({ gameId, playerName }) => {
    const player: Player = {
      id: socket.id,
      name: playerName,
      life: 40,
      commanderDamage: {},
      poisonCounters: 0,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
    };
    connectedPlayers.set(socket.id, player);
    socket.join(gameId);
    io.to(gameId).emit('player:joined', player);
    console.log(`[game:join] ${playerName} joined game ${gameId}`);
  });

  socket.on('player:update_life', ({ delta }) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    player.life = Math.max(0, player.life + delta);
    connectedPlayers.set(socket.id, player);
  });

  socket.on('chat:send', (message) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    rooms.forEach((room) => {
      io.to(room).emit('chat:message', {
        playerId: socket.id,
        playerName: player.name,
        text: message,
        timestamp: Date.now(),
      });
    });
  });

  socket.on('disconnect', () => {
    connectedPlayers.delete(socket.id);
    io.emit('player:left', socket.id);
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
