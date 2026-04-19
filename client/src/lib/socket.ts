import { io } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@mtg-commander/types';

export const socket = io<ServerToClientEvents, ClientToServerEvents>('http://localhost:3001', {
  autoConnect: false,
});
