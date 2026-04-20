// ── Legacy (kept for compat) ──────────────────────────────────────────────────

export interface ManaPool {
  white: number; blue: number; black: number;
  red: number; green: number; colorless: number;
}

export interface Player {
  id: string; name: string; life: number;
  commanderDamage: Record<string, number>;
  poisonCounters: number; manaPool: ManaPool;
}

export interface ChatMessage {
  playerId: string; playerName: string; text: string; timestamp: number;
}

export interface HealthResponse {
  status: 'ok'; uptime: number; timestamp: number;
}

// ── Cards ─────────────────────────────────────────────────────────────────────

export interface GameCard {
  instanceId: string;
  scryfallId: string;
  name: string;
  imageUri: string;
  typeLine: string;
  tapped: boolean;
}

export interface DeckCardData {
  scryfallId: string;
  cardName: string;
  imageUri: string;
  typeLine: string;
  quantity: number;
  isCommander: boolean;
}

// ── Rooms / Lobby ─────────────────────────────────────────────────────────────

export interface RoomPlayer {
  socketId: string;
  playerName: string;
  deckId: string | null;
  deckName: string | null;
  ready: boolean;
}

export interface Room {
  id: string;
  hostSocketId: string;
  hostName: string;
  players: RoomPlayer[];
  status: 'waiting' | 'in_progress';
  createdAt: number;
}

// ── Game State ────────────────────────────────────────────────────────────────

export type TurnPhase = 'untap' | 'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end';

export interface PersonalPlayerState {
  socketId: string;
  playerName: string;
  life: number;
  commanderDamage: Record<string, number>; // keyed by source socketId
  poisonCounters: number;
  commandZone: GameCard[];
  hand: GameCard[];     // populated only for self; empty array for opponents
  handCount: number;
  battlefield: GameCard[];
  graveyard: GameCard[];
  exile: GameCard[];
  libraryCount: number;
  isActive: boolean;
}

export interface PersonalGameState {
  roomId: string;
  mySocketId: string;
  players: PersonalPlayerState[]; // in turn order
  turnOrder: string[];
  activePlayerIndex: number;
  phase: TurnPhase;
  turn: number;
  log: string[];
}

// ── Socket Events ─────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  // Lobby
  'lobby:rooms': (rooms: Room[]) => void;
  // Room
  'room:updated': (room: Room) => void;
  'room:error': (message: string) => void;
  // Game
  'game:state': (state: PersonalGameState) => void;
  'game:error': (message: string) => void;
  // Legacy
  'player:joined': (player: Player) => void;
  'player:left': (playerId: string) => void;
  'chat:message': (payload: ChatMessage) => void;
}

export interface ClientToServerEvents {
  // Lobby
  'lobby:subscribe': () => void;
  'lobby:create_room': (payload: { playerName: string; userId: string }) => void;
  'lobby:join_room': (payload: { roomId: string; playerName: string; userId: string }) => void;
  // Room
  'room:select_deck': (payload: { deckId: string; deckName: string; cards: DeckCardData[] }) => void;
  'room:start_game': () => void;
  'room:leave': () => void;
  // Game
  'game:rejoin': () => void;
  'game:draw_card': () => void;
  'game:play_card': (payload: { instanceId: string }) => void;
  'game:tap_card': (payload: { instanceId: string }) => void;
  'game:end_phase': () => void;
  'game:end_turn': () => void;
  'game:update_life': (payload: { delta: number }) => void;
  'game:update_commander_damage': (payload: { fromSocketId: string; delta: number }) => void;
  'game:move_to_graveyard': (payload: { instanceId: string }) => void;
  'game:move_to_exile': (payload: { instanceId: string }) => void;
  'game:return_commander': (payload: { instanceId: string }) => void;
  // Legacy
  'game:join': (payload: { gameId: string; playerName: string }) => void;
  'player:update_life': (payload: { delta: number }) => void;
  'chat:send': (message: string) => void;
}
