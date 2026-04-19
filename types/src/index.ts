// ── Players & Game ────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  life: number;
  commanderDamage: Record<string, number>; // keyed by opponent player id
  poisonCounters: number;
  manaPool: ManaPool;
}

export interface ManaPool {
  white: number;
  blue: number;
  black: number;
  red: number;
  green: number;
  colorless: number;
}

export type GamePhase =
  | 'waiting'
  | 'beginning'
  | 'precombat_main'
  | 'combat'
  | 'postcombat_main'
  | 'ending';

export type GameStatus = 'lobby' | 'in_progress' | 'finished';

export interface GameState {
  id: string;
  status: GameStatus;
  phase: GamePhase;
  turn: number;
  activePlayerId: string;
  players: Record<string, Player>;
  createdAt: number;
}

// ── Cards ─────────────────────────────────────────────────────────────────────

export type CardType =
  | 'creature'
  | 'instant'
  | 'sorcery'
  | 'enchantment'
  | 'artifact'
  | 'land'
  | 'planeswalker'
  | 'battle';

export interface Card {
  id: string;
  scryfallId: string;
  name: string;
  manaCost: string;
  cmc: number;
  types: CardType[];
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  imageUri: string;
}

// ── Socket Events ─────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  'game:state': (state: GameState) => void;
  'game:error': (message: string) => void;
  'player:joined': (player: Player) => void;
  'player:left': (playerId: string) => void;
  'chat:message': (payload: ChatMessage) => void;
}

export interface ClientToServerEvents {
  'game:join': (payload: { gameId: string; playerName: string }) => void;
  'game:start': () => void;
  'player:update_life': (payload: { delta: number }) => void;
  'player:update_commander_damage': (payload: {
    fromPlayerId: string;
    delta: number;
  }) => void;
  'chat:send': (message: string) => void;
}

export interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  timestamp: number;
}
