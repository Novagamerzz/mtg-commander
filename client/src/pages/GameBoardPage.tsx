import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import type { PersonalGameState, PersonalPlayerState, GameCard, TurnPhase } from '@mtg-commander/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASES: { key: TurnPhase; label: string }[] = [
  { key: 'untap', label: 'Untap' },
  { key: 'upkeep', label: 'Upkeep' },
  { key: 'draw', label: 'Draw' },
  { key: 'main1', label: 'Main 1' },
  { key: 'combat', label: 'Combat' },
  { key: 'main2', label: 'Main 2' },
  { key: 'end', label: 'End' },
];

// ── Card back ────────────────────────────────────────────────────────────────

function CardBack({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded bg-gradient-to-br from-blue-950 to-indigo-950 border border-blue-900/50
                     flex items-center justify-center text-blue-800 text-[10px] font-bold select-none ${className}`}>
      MTG
    </div>
  );
}

// ── Card image with hover enlarge ─────────────────────────────────────────────

function GameCardImg({
  card, className = '', onClick, title,
}: {
  card: GameCard; className?: string; onClick?: () => void; title?: string;
}) {
  const [enlarged, setEnlarged] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={`relative shrink-0 cursor-pointer select-none ${className}`}
      onClick={onClick}
      onMouseEnter={() => setEnlarged(true)}
      onMouseLeave={() => setEnlarged(false)}
      title={title ?? card.name}
      style={{ transform: card.tapped ? 'rotate(90deg)' : undefined }}
    >
      {card.imageUri ? (
        <img src={card.imageUri} alt={card.name} className="w-full h-full rounded object-cover" />
      ) : (
        <div className="w-full h-full rounded bg-gray-800 border border-gray-700 flex items-center justify-center p-1">
          <span className="text-gray-400 text-[9px] text-center leading-tight">{card.name}</span>
        </div>
      )}

      {card.tapped && (
        <div className="absolute inset-0 rounded bg-yellow-500/10 border border-yellow-700/30" />
      )}

      {/* Hover enlarge */}
      {enlarged && card.imageUri && (
        <div
          className="absolute z-50 left-full ml-2 top-0 pointer-events-none"
          style={{ width: 180 }}
        >
          <img src={card.imageUri} alt={card.name} className="w-full rounded-xl shadow-2xl border border-gray-700" />
        </div>
      )}
    </div>
  );
}

// ── Opponent zone ─────────────────────────────────────────────────────────────

function OpponentZone({ player }: { player: PersonalPlayerState }) {
  const commander = player.commandZone[0];
  const lifeColor = player.life <= 0 ? 'text-red-600' : player.life <= 10 ? 'text-red-400' : 'text-gray-100';

  return (
    <div className={`flex-1 min-w-0 rounded-xl border p-2 flex flex-col gap-1.5 overflow-hidden
                     ${player.isActive ? 'border-yellow-600/70 bg-yellow-950/10' : 'border-gray-800 bg-gray-900/40'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        {player.isActive && <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse shrink-0" />}
        <span className="font-semibold text-sm text-gray-100 truncate flex-1">{player.playerName}</span>
        <span className={`font-mono font-bold text-sm shrink-0 ${lifeColor}`}>♥ {player.life}</span>
      </div>

      {/* Commander */}
      {commander && (
        <p className="text-xs text-yellow-600/80 truncate shrink-0">⚜ {commander.name}</p>
      )}

      {/* Face-down hand */}
      {player.handCount > 0 && (
        <div className="flex items-center gap-0.5 shrink-0 flex-wrap">
          {Array.from({ length: Math.min(player.handCount, 10) }).map((_, i) => (
            <CardBack key={i} className="w-5 h-7" />
          ))}
          {player.handCount > 10 && (
            <span className="text-xs text-gray-600 ml-1">+{player.handCount - 10}</span>
          )}
        </div>
      )}

      {/* Battlefield */}
      <div className="flex-1 flex flex-wrap gap-1 content-start overflow-hidden">
        {player.battlefield.slice(0, 10).map((card) => (
          <GameCardImg key={card.instanceId} card={card} className="w-10 h-14" />
        ))}
        {player.battlefield.length > 10 && (
          <span className="text-xs text-gray-600 self-center">+{player.battlefield.length - 10}</span>
        )}
      </div>

      {/* Counts */}
      <div className="flex items-center gap-2.5 text-xs text-gray-600 shrink-0">
        <span>📚 {player.libraryCount}</span>
        <span>🪦 {player.graveyard.length}</span>
        <span>✦ {player.exile.length}</span>
        {player.poisonCounters > 0 && <span className="text-green-600">☠ {player.poisonCounters}</span>}
      </div>
    </div>
  );
}

// ── Commander damage matrix ───────────────────────────────────────────────────

function CommanderDamageMatrix({
  players, mySocketId, onUpdate,
}: {
  players: PersonalPlayerState[];
  mySocketId: string;
  onUpdate: (fromSocketId: string, delta: number) => void;
}) {
  const me = players.find((p) => p.socketId === mySocketId);
  if (!me) return null;

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
        Commander Damage received by you
      </h3>
      <div className="flex flex-col gap-1.5">
        {players
          .filter((p) => p.socketId !== mySocketId)
          .map((source) => {
            const dmg = me.commanderDamage[source.socketId] ?? 0;
            const dangerous = dmg >= 17;
            const lethal = dmg >= 21;
            const commanderName = source.commandZone[0]?.name ?? source.playerName;
            return (
              <div key={source.socketId} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 flex-1 truncate" title={commanderName}>
                  {commanderName.split(',')[0]}
                </span>
                <div className={`flex items-center gap-1 ${lethal ? 'text-red-500' : dangerous ? 'text-orange-400' : 'text-gray-300'}`}>
                  <button
                    onClick={() => onUpdate(source.socketId, -1)}
                    className="text-gray-600 hover:text-gray-200 w-4 h-4 flex items-center justify-center transition"
                  >
                    −
                  </button>
                  <span className="font-mono w-5 text-center text-sm font-semibold">{dmg}</span>
                  <button
                    onClick={() => onUpdate(source.socketId, 1)}
                    className="text-gray-600 hover:text-gray-200 w-4 h-4 flex items-center justify-center transition"
                  >
                    +
                  </button>
                </div>
                {lethal && <span className="text-xs text-red-500">LETHAL</span>}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── Battlefield card with context menu ────────────────────────────────────────

function BattlefieldCard({
  card, isMe, onTap, onGraveyard, onExile, onReturnCommander,
}: {
  card: GameCard;
  isMe: boolean;
  onTap: () => void;
  onGraveyard: () => void;
  onExile: () => void;
  onReturnCommander: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const isCommander = card.typeLine.toLowerCase().includes('legendary') && card.typeLine.toLowerCase().includes('creature');

  return (
    <div
      className="relative shrink-0 group"
      style={{ transform: card.tapped ? 'rotate(90deg)' : undefined, marginBottom: card.tapped ? '20px' : undefined }}
    >
      <div className="w-16 cursor-pointer" onClick={isMe ? onTap : undefined}>
        {card.imageUri ? (
          <img src={card.imageUri} alt={card.name} className="w-full rounded shadow-lg border border-gray-800 hover:border-gray-600 transition" />
        ) : (
          <div className="w-16 h-24 rounded bg-gray-800 border border-gray-700 flex items-center justify-center p-1">
            <span className="text-gray-400 text-[9px] text-center leading-tight">{card.name}</span>
          </div>
        )}
      </div>

      {isMe && (
        <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition z-10">
          <button
            onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}
            className="w-4 h-4 rounded-full bg-gray-700 hover:bg-gray-500 text-gray-300 text-xs flex items-center justify-center"
          >
            ⋮
          </button>
          {menu && (
            <div className="absolute top-5 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-xl text-xs w-32 py-1 z-20">
              <button onClick={() => { onTap(); setMenu(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition">
                {card.tapped ? 'Untap' : 'Tap'}
              </button>
              <button onClick={() => { onGraveyard(); setMenu(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition">
                → Graveyard
              </button>
              <button onClick={() => { onExile(); setMenu(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-gray-300 transition">
                → Exile
              </button>
              {isCommander && (
                <button onClick={() => { onReturnCommander(); setMenu(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-yellow-400 transition">
                  → Command Zone
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── My zone ───────────────────────────────────────────────────────────────────

function MyZone({
  player, isMyTurn, onUpdateLife, onPlayCard, onTapCard,
  onGraveyard, onExile, onReturnCommander,
}: {
  player: PersonalPlayerState;
  isMyTurn: boolean;
  onUpdateLife: (delta: number) => void;
  onPlayCard: (instanceId: string) => void;
  onTapCard: (instanceId: string) => void;
  onGraveyard: (instanceId: string) => void;
  onExile: (instanceId: string) => void;
  onReturnCommander: (instanceId: string) => void;
}) {
  const lifeColor = player.life <= 0 ? 'text-red-600' : player.life <= 10 ? 'text-red-400' : 'text-green-400';
  const commander = player.commandZone[0];

  return (
    <div className="h-full flex flex-col border-t border-gray-800 bg-gray-900/30">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800/60 shrink-0">
        {/* Life */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onUpdateLife(-1)}
            className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-red-900 text-gray-300 font-bold transition"
          >
            −
          </button>
          <span className={`text-2xl font-bold font-mono ${lifeColor} min-w-[3ch] text-center`}>
            {player.life}
          </span>
          <button
            onClick={() => onUpdateLife(1)}
            className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-green-900 text-gray-300 font-bold transition"
          >
            +
          </button>
          <span className="text-xs text-gray-600">life</span>
        </div>

        {/* Commander */}
        {commander && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-11 shrink-0">
              {commander.imageUri ? (
                <img src={commander.imageUri} alt={commander.name} className="w-full h-full rounded object-cover" />
              ) : (
                <CardBack className="w-full h-full" />
              )}
            </div>
            <div>
              <p className="text-xs text-yellow-600">⚜ Commander</p>
              <p className="text-xs text-gray-300 truncate max-w-[140px]">{commander.name}</p>
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-4 text-xs text-gray-500">
          <span>📚 {player.libraryCount}</span>
          <span>✋ {player.handCount}</span>
          <span className="hover:text-gray-300 cursor-default" title={`${player.graveyard.length} cards`}>🪦 {player.graveyard.length}</span>
          <span className="hover:text-gray-300 cursor-default" title={`${player.exile.length} cards`}>✦ {player.exile.length}</span>
          {player.poisonCounters > 0 && <span className="text-green-600">☠ {player.poisonCounters}</span>}
        </div>

        {!isMyTurn && <span className="text-xs text-gray-600 italic shrink-0">Waiting for your turn</span>}
      </div>

      {/* Battlefield */}
      <div className="flex-1 overflow-x-auto flex items-center gap-2 px-4 py-2 min-h-0">
        {player.battlefield.length === 0 ? (
          <p className="text-gray-800 text-sm italic">Battlefield empty — click cards in hand to play</p>
        ) : (
          player.battlefield.map((card) => (
            <BattlefieldCard
              key={card.instanceId}
              card={card}
              isMe
              onTap={() => onTapCard(card.instanceId)}
              onGraveyard={() => onGraveyard(card.instanceId)}
              onExile={() => onExile(card.instanceId)}
              onReturnCommander={() => onReturnCommander(card.instanceId)}
            />
          ))
        )}
      </div>

      {/* Hand */}
      <div className="h-28 shrink-0 overflow-x-auto flex items-end gap-1 px-4 pb-2 pt-1 bg-gray-950/40">
        {player.hand.length === 0 ? (
          <p className="text-gray-800 text-xs italic self-center">Hand empty</p>
        ) : (
          player.hand.map((card) => (
            <div
              key={card.instanceId}
              onClick={() => onPlayCard(card.instanceId)}
              className="w-16 shrink-0 cursor-pointer hover:scale-110 hover:-translate-y-3 transition-transform origin-bottom"
              title={`Play ${card.name}`}
            >
              {card.imageUri ? (
                <img src={card.imageUri} alt={card.name} className="w-full rounded shadow-lg" />
              ) : (
                <CardBack className="w-full h-24" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GameBoardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<PersonalGameState | null>(null);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    socket.on('game:state', setGameState);
    socket.on('game:error', (msg) => console.error('[game:error]', msg));
    socket.emit('game:rejoin');
    return () => {
      socket.off('game:state', setGameState);
      socket.off('game:error');
    };
  }, []);

  if (!gameState) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-500 animate-pulse">
        Connecting to game…
      </div>
    );
  }

  const mySocketId = gameState.mySocketId;
  const me = gameState.players.find((p) => p.socketId === mySocketId);
  const opponents = gameState.players.filter((p) => p.socketId !== mySocketId);
  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyTurn = activePlayer?.socketId === mySocketId;

  if (!me) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p>Could not find your player in this game.</p>
          <button onClick={() => navigate('/lobby')} className="text-yellow-600 underline mt-2 text-sm">Back to lobby</button>
        </div>
      </div>
    );
  }

  // Emit helpers
  const emit = {
    drawCard: () => socket.emit('game:draw_card'),
    playCard: (instanceId: string) => socket.emit('game:play_card', { instanceId }),
    tapCard: (instanceId: string) => socket.emit('game:tap_card', { instanceId }),
    endPhase: () => socket.emit('game:end_phase'),
    endTurn: () => socket.emit('game:end_turn'),
    updateLife: (delta: number) => socket.emit('game:update_life', { delta }),
    updateCmdDmg: (fromSocketId: string, delta: number) =>
      socket.emit('game:update_commander_damage', { fromSocketId, delta }),
    toGraveyard: (instanceId: string) => socket.emit('game:move_to_graveyard', { instanceId }),
    toExile: (instanceId: string) => socket.emit('game:move_to_exile', { instanceId }),
    returnCommander: (instanceId: string) => socket.emit('game:return_commander', { instanceId }),
  };

  return (
    <div className="h-screen flex flex-col bg-gray-950 overflow-hidden select-none">

      {/* ── Header ── */}
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-gray-800 bg-gray-900/80">
        {/* Turn + phase */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-600 font-mono">T{gameState.turn}</span>
          <span className="text-xs text-gray-400 font-semibold">{activePlayer?.playerName}</span>
        </div>

        {/* Phase strip */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1">
          {PHASES.map(({ key, label }) => (
            <span
              key={key}
              className={`text-xs px-2 py-0.5 rounded-full shrink-0 transition ${
                gameState.phase === key
                  ? 'bg-yellow-600 text-gray-950 font-semibold'
                  : 'text-gray-600'
              }`}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={emit.drawCard}
            className="text-xs text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500
                       px-2.5 py-1 rounded-lg transition"
          >
            Draw
          </button>

          {isMyTurn ? (
            <>
              <button
                onClick={emit.endPhase}
                className="text-xs text-gray-300 hover:text-white border border-gray-700 hover:border-gray-500
                           px-2.5 py-1 rounded-lg transition"
              >
                Next Phase →
              </button>
              <button
                onClick={emit.endTurn}
                className="text-xs bg-yellow-700 hover:bg-yellow-600 text-gray-950 font-semibold px-3 py-1 rounded-lg transition"
              >
                End Turn ⏭
              </button>
            </>
          ) : (
            <span className="text-xs text-gray-700 italic">{activePlayer?.playerName}'s turn</span>
          )}

          <button
            onClick={() => setShowLog(!showLog)}
            className="text-xs text-gray-600 hover:text-gray-400 px-2 transition"
          >
            Log
          </button>

          <button
            onClick={() => navigate('/lobby')}
            className="text-xs text-gray-700 hover:text-gray-400 transition ml-1"
          >
            ✕
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* Opponents row */}
        <div className="flex gap-2 p-2 border-b border-gray-800/60 shrink-0" style={{ height: '210px' }}>
          {opponents.map((p) => (
            <OpponentZone key={p.socketId} player={p} />
          ))}
          {opponents.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-gray-800 text-sm italic">
              No opponents yet
            </div>
          )}
        </div>

        {/* Middle: commander damage + log */}
        <div className="flex gap-3 p-3 overflow-hidden flex-1 min-h-0">
          <div className="shrink-0 flex flex-col gap-3">
            <CommanderDamageMatrix
              players={gameState.players}
              mySocketId={mySocketId}
              onUpdate={emit.updateCmdDmg}
            />
          </div>

          {/* Game log */}
          <div className={`flex-1 overflow-hidden ${showLog ? 'flex flex-col' : 'hidden'}`}>
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Game Log</h3>
            <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
              {gameState.log.map((entry, i) => (
                <p key={i} className={`text-xs ${i === 0 ? 'text-gray-300' : 'text-gray-600'}`}>
                  {entry}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* My zone */}
        <div className="shrink-0" style={{ height: '300px' }}>
          <MyZone
            player={me}
            isMyTurn={isMyTurn}
            onUpdateLife={emit.updateLife}
            onPlayCard={emit.playCard}
            onTapCard={emit.tapCard}
            onGraveyard={emit.toGraveyard}
            onExile={emit.toExile}
            onReturnCommander={emit.returnCommander}
          />
        </div>
      </div>
    </div>
  );
}
