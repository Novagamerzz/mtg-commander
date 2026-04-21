// Inlined from @mtg-commander/types — kept in sync with types/src/index.ts

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
  counters?: Record<string, number>;
  powerOverride?: string | null;
  toughnessOverride?: string | null;
}

export interface DeckCardData {
  scryfallId: string;
  cardName: string;
  imageUri: string;
  typeLine: string;
  oracleText: string;
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
  hasPassword?: boolean;
  password?: string;
}

// ── Game State ────────────────────────────────────────────────────────────────

export type TurnPhase = 'untap' | 'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end';

export interface PersonalPlayerState {
  socketId: string;
  playerName: string;
  life: number;
  commanderDamage: Record<string, number>;
  poisonCounters: number;
  commandZone: GameCard[];
  hand: GameCard[];
  handCount: number;
  battlefield: GameCard[];
  graveyard: GameCard[];
  exile: GameCard[];
  libraryCount: number;
  isActive: boolean;
  commanderCastCount: number;
  landsPlayedThisTurn: number;
  eliminated: boolean;
  mulliganCount: number;
  mulliganReady: boolean;
}

export interface PersonalGameState {
  roomId: string;
  mySocketId: string;
  players: PersonalPlayerState[];
  turnOrder: string[];
  activePlayerIndex: number;
  phase: TurnPhase;
  turn: number;
  log: string[];
  pendingElimination: { socketId: string; playerName: string; reason: string } | null;
  mulliganPhase: boolean;
  monarchSocketId: string | null;
}

// ── Socket Events ─────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  'lobby:rooms': (rooms: Room[]) => void;
  'game:first_player': (data: { playerName: string }) => void;
  'game:announcement': (data: { message: string; type: 'defeat' | 'info' }) => void;
  'room:updated': (room: Room) => void;
  'room:error': (message: string) => void;
  'game:state': (state: PersonalGameState) => void;
  'game:error': (message: string) => void;
  'game:library_contents': (cards: GameCard[]) => void;
  'game:scry_cards': (cards: GameCard[]) => void;
  'game:mill_result': (cards: GameCard[]) => void;
  'game:dice_result': (data: { playerName: string; sides: number; result: number }) => void;
  'player:joined': (player: Player) => void;
  'player:left': (playerId: string) => void;
  'chat:message': (payload: ChatMessage) => void;
}

export interface ClientToServerEvents {
  'lobby:subscribe': () => void;
  'lobby:create_room': (payload: { playerName: string; userId: string; password?: string }) => void;
  'lobby:join_room': (payload: { roomId: string; playerName: string; userId: string; password?: string }) => void;
  'room:select_deck': (payload: { deckId: string; deckName: string; cards: DeckCardData[] }) => void;
  'room:start_game': () => void;
  'room:leave': () => void;
  'game:rejoin': (payload?: { userId?: string }) => void;
  'game:draw_card': () => void;
  'game:play_card': (payload: { instanceId: string }) => void;
  'game:tap_card': (payload: { instanceId: string }) => void;
  'game:end_phase': () => void;
  'game:end_turn': () => void;
  'game:update_life': (payload: { delta: number }) => void;
  'game:update_commander_damage': (payload: { fromSocketId: string; delta: number }) => void;
  'game:move_to_graveyard': (payload: { instanceId: string }) => void;
  'game:move_to_exile': (payload: { instanceId: string }) => void;
  'game:move_to_hand': (payload: { instanceId: string }) => void;
  'game:return_to_battlefield': (payload: { instanceId: string }) => void;
  'game:return_commander': (payload: { instanceId: string }) => void;
  'game:cast_commander': () => void;
  'game:request_library': () => void;
  'game:tutor': (payload: { instanceId: string; to: 'hand' | 'battlefield' }) => void;
  'game:create_token': (payload: { name: string; power: string; toughness: string; color: string; typeLine: string; imageUri: string }) => void;
  'game:copy_card': (payload: { instanceId: string }) => void;
  'game:shuffle_library': () => void;
  'game:update_counter': (payload: { instanceId: string; counter: string; delta: number }) => void;
  'game:set_pt': (payload: { instanceId: string; power: string; toughness: string }) => void;
  'game:give_control': (payload: { instanceId: string; targetSocketId: string }) => void;
  'game:confirm_elimination': (payload: { targetSocketId: string }) => void;
  'game:cancel_elimination': () => void;
  'game:scry': (payload: { count: number }) => void;
  'game:scry_resolve': (payload: { keepOnTop: string[]; putOnBottom: string[] }) => void;
  'game:mulligan': () => void;
  'game:mulligan_keep': () => void;
  'game:concede': () => void;
  'game:mill': (payload: { count: number }) => void;
  'game:roll_dice': (payload: { sides: number }) => void;
  'game:claim_monarch': () => void;
  'game:update_poison': (payload: { delta: number }) => void;
  'game:join': (payload: { gameId: string; playerName: string }) => void;
  'player:update_life': (payload: { delta: number }) => void;
  'chat:send': (message: string) => void;
}
