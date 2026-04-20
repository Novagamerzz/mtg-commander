import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './types';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001',
  { autoConnect: false },
);
