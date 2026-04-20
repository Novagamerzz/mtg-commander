import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import type { PersonalGameState, PersonalPlayerState, GameCard, TurnPhase } from '@mtg-commander/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASES: { key: TurnPhase; label: string; short: string }[] = [
  { key: 'untap',  label: 'Untap',  short: 'UT' },
  { key: 'upkeep', label: 'Upkeep', short: 'UP' },
  { key: 'draw',   label: 'Draw',   short: 'DR' },
  { key: 'main1',  label: 'Main 1', short: 'M1' },
  { key: 'combat', label: 'Combat', short: 'CB' },
  { key: 'main2',  label: 'Main 2', short: 'M2' },
  { key: 'end',    label: 'End',    short: 'EN' },
];

// Green felt table background
const FELT: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 50% 0%,   rgba(25,80,50,0.9) 0%, transparent 55%),
    radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.7)    0%, transparent 55%),
    radial-gradient(ellipse at 0%  50%,  rgba(0,0,0,0.3)    0%, transparent 50%),
    radial-gradient(ellipse at 100% 50%, rgba(0,0,0,0.3)    0%, transparent 50%),
    #0e2818
  `,
};

interface DragData { instanceId: string; source: 'hand' | 'battlefield' }

// ── Card back ─────────────────────────────────────────────────────────────────

function CardBack({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      className="rounded-lg shrink-0 select-none flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2040 40%, #1a1060 100%)',
        border: '1px solid rgba(100,130,200,0.3)',
        boxShadow: 'inset 0 0 8px rgba(0,0,100,0.4)',
        ...style,
      }}
    >
      <div
        style={{
          width: '70%', height: '70%', borderRadius: 4,
          border: '1px solid rgba(150,170,220,0.2)',
          background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(80,100,180,0.08) 4px, rgba(80,100,180,0.08) 8px)',
        }}
      />
    </div>
  );
}

// ── Global card hover preview ─────────────────────────────────────────────────

function HoverPreview({ card, x, y }: { card: GameCard; x: number; y: number }) {
  if (!card.imageUri) return null;
  const W = 240, H = 336;
  const left = x + W + 24 > window.innerWidth ? x - W - 12 : x + 16;
  const top  = Math.max(8, Math.min(y - 80, window.innerHeight - H - 8));
  return (
    <div style={{ position: 'fixed', left, top, width: W, zIndex: 9999, pointerEvents: 'none' }}>
      <img src={card.imageUri} alt={card.name}
        className="w-full rounded-2xl shadow-2xl"
        style={{ border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 30px 60px rgba(0,0,0,0.8)' }}
      />
      <p className="text-center text-xs text-gray-400 mt-1 font-medium">{card.name}</p>
    </div>
  );
}

// ── Phase tracker ─────────────────────────────────────────────────────────────

function PhaseTracker({ phase }: { phase: TurnPhase }) {
  return (
    <div className="flex items-center gap-1">
      {PHASES.map(({ key, label }) => {
        const active = phase === key;
        return (
          <div key={key} className="relative flex items-center">
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all duration-200 select-none ${
                active
                  ? 'text-gray-950 shadow-lg shadow-yellow-900/60 scale-110'
                  : 'text-gray-600 hover:text-gray-500'
              }`}
              style={active ? {
                background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 100%)',
                boxShadow: '0 0 12px rgba(250,204,21,0.5)',
              } : {}}
            >
              {label}
            </span>
            {active && key !== 'end' && (
              <span className="text-gray-700 ml-1 text-xs">›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tapped card wrapper (handles layout shift correctly) ──────────────────────

function TappedCardWrapper({
  card, cardW, cardH, children, className = '',
}: {
  card: GameCard; cardW: number; cardH: number;
  children: React.ReactNode; className?: string;
}) {
  // When tapped, the visual footprint rotates: width ↔ height
  const w = card.tapped ? cardH : cardW;
  const h = card.tapped ? cardW : cardH;
  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: w, height: h, transition: 'width 0.2s, height 0.2s' }}
    >
      <div
        style={{
          position: 'absolute',
          width: cardW, height: cardH,
          top: card.tapped ? (cardW - cardH) / 2 : 0,
          left: card.tapped ? (cardH - cardW) / 2 : 0,
          transform: card.tapped ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Opponent zone ─────────────────────────────────────────────────────────────

function OpponentZone({
  player, onHover, onHoverEnd,
}: {
  player: PersonalPlayerState;
  onHover: (c: GameCard) => void;
  onHoverEnd: () => void;
}) {
  const commander = player.commandZone[0];
  const life = player.life;
  const lifeStyle: React.CSSProperties =
    life <= 0  ? { color: '#dc2626' } :
    life <= 10 ? { color: '#f97316' } :
                 { color: '#f9fafb' };

  return (
    <div
      className="flex-1 min-w-0 rounded-xl flex flex-col overflow-hidden"
      style={{
        border: player.isActive
          ? '2px solid rgba(250,204,21,0.8)'
          : '1px solid rgba(255,255,255,0.08)',
        background: player.isActive
          ? 'rgba(250,204,21,0.06)'
          : 'rgba(0,0,0,0.35)',
        boxShadow: player.isActive ? '0 0 20px rgba(250,204,21,0.15)' : 'none',
      }}
    >
      {/* Header: name + life */}
      <div className="flex items-center gap-3 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {player.isActive && (
            <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse"
              style={{ background: '#facc15', boxShadow: '0 0 6px #facc15' }} />
          )}
          <span className="font-bold text-lg text-white truncate">{player.playerName}</span>
          {commander && (
            <span className="text-xs truncate hidden sm:block" style={{ color: '#f59e0b' }}>
              ⚜ {commander.name.split(',')[0]}
            </span>
          )}
        </div>
        {/* Life total — large */}
        <span className="font-black font-mono tabular-nums shrink-0"
          style={{ fontSize: '2.75rem', lineHeight: 1, ...lifeStyle }}>
          {life}
        </span>
      </div>

      {/* Hand: face-down card backs */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex gap-0.5 items-center">
          {Array.from({ length: Math.min(player.handCount, 14) }).map((_, i) => (
            <CardBack key={i} style={{ width: 20, height: 28 }} />
          ))}
          {player.handCount > 14 && (
            <span className="text-xs ml-1" style={{ color: '#6b7280' }}>+{player.handCount - 14}</span>
          )}
        </div>
        <span className="text-xs font-medium" style={{ color: '#6b7280' }}>
          {player.handCount} in hand
        </span>
      </div>

      {/* Battlefield label + cards */}
      <div className="flex-1 overflow-hidden flex flex-col px-2 pt-1 pb-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-widest mb-1"
          style={{ color: 'rgba(255,255,255,0.2)' }}>Battlefield</p>
        <div className="flex-1 flex flex-wrap gap-1 content-start overflow-hidden">
          {player.battlefield.slice(0, 14).map((card) => (
            <TappedCardWrapper key={card.instanceId} card={card} cardW={34} cardH={48}>
              <div
                onMouseEnter={() => onHover(card)}
                onMouseLeave={onHoverEnd}
                className="w-full h-full cursor-default"
              >
                {card.imageUri ? (
                  <img src={card.imageUri} className="w-full h-full object-cover rounded"
                    style={{ opacity: card.tapped ? 0.75 : 1 }} />
                ) : (
                  <div className="w-full h-full rounded flex items-center justify-center p-0.5"
                    style={{ background: '#1f2937', border: '1px solid #374151' }}>
                    <span className="text-[7px] text-center" style={{ color: '#6b7280' }}>
                      {card.name.slice(0, 8)}
                    </span>
                  </div>
                )}
              </div>
            </TappedCardWrapper>
          ))}
          {player.battlefield.length > 14 && (
            <span className="text-xs self-center" style={{ color: '#4b5563' }}>
              +{player.battlefield.length - 14}
            </span>
          )}
          {player.battlefield.length === 0 && (
            <p className="text-[10px] italic" style={{ color: '#374151' }}>Empty</p>
          )}
        </div>
      </div>

      {/* Zone counts */}
      <div className="flex items-center gap-3 px-3 py-1 text-xs font-medium shrink-0"
        style={{ color: '#4b5563', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <span>📚 {player.libraryCount}</span>
        <span>🪦 {player.graveyard.length}</span>
        <span>✦ {player.exile.length}</span>
        {player.poisonCounters > 0 && <span style={{ color: '#16a34a' }}>☠ {player.poisonCounters}</span>}
      </div>
    </div>
  );
}

// ── Drop zone wrapper (battlefield, graveyard, exile) ─────────────────────────

function DropZone({
  label, accept, onDrop, isOver, onDragOver, onDragLeave, children, style, className = '',
}: {
  label: string;
  accept: DragData['source'][];
  onDrop: (data: DragData) => void;
  isOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-xl transition-all duration-150 ${className}`}
      style={{
        border: isOver ? '2px solid rgba(134,239,172,0.7)' : '2px dashed rgba(255,255,255,0.1)',
        background: isOver ? 'rgba(134,239,172,0.06)' : 'rgba(0,0,0,0.2)',
        boxShadow: isOver ? '0 0 20px rgba(134,239,172,0.15), inset 0 0 20px rgba(134,239,172,0.05)' : 'none',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        ...style,
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const data: DragData = JSON.parse(e.dataTransfer.getData('application/json'));
          if (accept.includes(data.source)) onDrop(data);
        } catch { /* invalid drag */ }
      }}
    >
      {/* Zone label */}
      <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-10" style={{ top: 6 }}>
        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{
            color: isOver ? 'rgba(134,239,172,0.9)' : 'rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.4)',
          }}>
          {label}
        </span>
      </div>

      {isOver && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center z-10 pointer-events-none">
          <span className="text-sm font-bold" style={{ color: 'rgba(134,239,172,0.8)' }}>Drop here</span>
        </div>
      )}

      {children}
    </div>
  );
}

// ── Pile zone (graveyard or exile) ────────────────────────────────────────────

function PileZone({
  cards, label, isOver, onDragOver, onDragLeave, onDrop, onHover, onHoverEnd, accentColor,
}: {
  cards: GameCard[];
  label: string;
  isOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (data: DragData) => void;
  onHover: (c: GameCard) => void;
  onHoverEnd: () => void;
  accentColor: string;
}) {
  const topCard = cards[cards.length - 1];

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>
        {label}
      </span>
      <div
        className="relative rounded-lg overflow-hidden cursor-default transition-all duration-150"
        style={{
          width: 52, height: 74,
          border: isOver ? `2px solid ${accentColor}` : '2px dashed rgba(255,255,255,0.12)',
          background: isOver ? `${accentColor}18` : 'rgba(0,0,0,0.3)',
          boxShadow: isOver ? `0 0 12px ${accentColor}44` : 'none',
          flexShrink: 0,
        }}
        onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          try {
            const data: DragData = JSON.parse(e.dataTransfer.getData('application/json'));
            onDrop(data);
          } catch { /* */ }
        }}
        onMouseEnter={() => topCard && onHover(topCard)}
        onMouseLeave={onHoverEnd}
      >
        {topCard?.imageUri ? (
          <img src={topCard.imageUri} className="w-full h-full object-cover opacity-90" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <span className="text-xl" style={{ opacity: 0.3 }}>{label === 'Graveyard' ? '🪦' : '✦'}</span>
          </div>
        )}
        {/* Count badge */}
        <div className="absolute inset-x-0 bottom-0 py-0.5 text-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}>
          <span className="text-xs font-bold" style={{ color: accentColor }}>{cards.length}</span>
        </div>
      </div>
    </div>
  );
}

// ── My battlefield card ───────────────────────────────────────────────────────

function MyBattlefieldCard({
  card, onTap, onGraveyard, onExile, onReturnCommander, onDragStart, onHover, onHoverEnd,
}: {
  card: GameCard;
  onTap: () => void;
  onGraveyard: () => void;
  onExile: () => void;
  onReturnCommander: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onHover: (c: GameCard) => void;
  onHoverEnd: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const CARD_W = 56, CARD_H = 80;

  return (
    <TappedCardWrapper card={card} cardW={CARD_W} cardH={CARD_H} className="group">
      <div
        draggable
        onDragStart={(e) => { onDragStart(e); setMenu(false); }}
        onClick={onTap}
        onMouseEnter={() => onHover(card)}
        onMouseLeave={() => { onHoverEnd(); }}
        className="w-full h-full cursor-pointer"
        style={{ cursor: card.tapped ? 'pointer' : 'grab' }}
      >
        {card.imageUri ? (
          <img src={card.imageUri} alt={card.name}
            className="w-full h-full object-cover rounded-lg"
            style={{
              boxShadow: card.tapped ? '0 0 8px rgba(250,204,21,0.3)' : '0 4px 8px rgba(0,0,0,0.5)',
              border: card.tapped ? '1px solid rgba(250,204,21,0.4)' : '1px solid rgba(255,255,255,0.1)',
              opacity: card.tapped ? 0.85 : 1,
            }} />
        ) : (
          <div className="w-full h-full rounded-lg flex items-center justify-center p-1"
            style={{ background: '#1f2937', border: '1px solid #374151' }}>
            <span className="text-[9px] text-center leading-tight" style={{ color: '#6b7280' }}>{card.name}</span>
          </div>
        )}
      </div>

      {/* Context menu button */}
      <button
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center
                   text-xs font-bold opacity-0 group-hover:opacity-100 transition z-20"
        style={{ background: '#374151', border: '1px solid #4b5563', color: '#d1d5db' }}
        onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}
      >
        ⋮
      </button>

      {menu && (
        <div
          className="absolute top-4 right-0 rounded-xl py-1 z-30 overflow-hidden"
          style={{
            width: 130, background: '#111827',
            border: '1px solid #374151',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: card.tapped ? '↺ Untap' : '↻ Tap', action: () => { onTap(); setMenu(false); }, color: '#d1d5db' },
            { label: '→ Graveyard', action: () => { onGraveyard(); setMenu(false); }, color: '#9ca3af' },
            { label: '→ Exile',     action: () => { onExile(); setMenu(false); },     color: '#a78bfa' },
            { label: '→ Cmd Zone',  action: () => { onReturnCommander(); setMenu(false); }, color: '#f59e0b' },
          ].map(({ label, action, color }) => (
            <button key={label} onClick={action}
              className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition"
              style={{ color }}>
              {label}
            </button>
          ))}
        </div>
      )}
    </TappedCardWrapper>
  );
}

// ── Commander damage matrix ───────────────────────────────────────────────────

function CmdDamageMatrix({
  players, mySocketId, onUpdate,
}: {
  players: PersonalPlayerState[];
  mySocketId: string;
  onUpdate: (from: string, delta: number) => void;
}) {
  const me = players.find((p) => p.socketId === mySocketId);
  if (!me || players.filter((p) => p.socketId !== mySocketId).length === 0) return null;

  return (
    <div className="rounded-xl p-3 shrink-0" style={{
      background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 180,
    }}>
      <p className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Cmd Damage → You
      </p>
      <div className="flex flex-col gap-3">
        {players.filter((p) => p.socketId !== mySocketId).map((src) => {
          const dmg = me.commanderDamage[src.socketId] ?? 0;
          const lethal = dmg >= 21;
          const warn   = dmg >= 17;
          const cmdName = (src.commandZone[0]?.name ?? src.playerName).split(',')[0];
          const color = lethal ? '#ef4444' : warn ? '#f97316' : '#d1d5db';
          return (
            <div key={src.socketId}>
              <p className="text-[10px] truncate mb-1" style={{ color: '#6b7280' }} title={cmdName}>{cmdName}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => onUpdate(src.socketId, -1)}
                  className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition hover:bg-white/10"
                  style={{ color: '#6b7280' }}>−</button>
                <span className="font-black font-mono tabular-nums w-8 text-center text-xl"
                  style={{ color, textShadow: lethal ? '0 0 10px #ef4444' : 'none' }}>
                  {dmg}
                </span>
                <button onClick={() => onUpdate(src.socketId, 1)}
                  className="w-6 h-6 rounded flex items-center justify-center text-sm font-bold transition hover:bg-white/10"
                  style={{ color: '#6b7280' }}>+</button>
                {lethal && <span className="text-xs font-bold animate-pulse" style={{ color: '#ef4444' }}>LETHAL</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GameBoardPage() {
  const { roomId: _roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<PersonalGameState | null>(null);
  const [showLog, setShowLog] = useState(true);
  const [hoverCard, setHoverCard] = useState<GameCard | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  // Drop zone hover state
  const [overBf,  setOverBf]  = useState(false);
  const [overGy,  setOverGy]  = useState(false);
  const [overEx,  setOverEx]  = useState(false);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    socket.on('game:state', setGameState);
    socket.emit('game:rejoin');
    return () => { socket.off('game:state', setGameState); };
  }, []);

  if (!gameState) {
    return (
      <div className="h-screen flex items-center justify-center" style={FELT}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-2 border-yellow-500/40 border-t-yellow-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg font-medium">Connecting to game…</p>
        </div>
      </div>
    );
  }

  const mySocketId = gameState.mySocketId;
  const me         = gameState.players.find((p) => p.socketId === mySocketId);
  const opponents  = gameState.players.filter((p) => p.socketId !== mySocketId);
  const active     = gameState.players[gameState.activePlayerIndex];
  const isMyTurn   = active?.socketId === mySocketId;

  if (!me) return (
    <div className="h-screen flex items-center justify-center" style={FELT}>
      <div className="text-center">
        <p className="text-gray-400 mb-3">Could not find your player.</p>
        <button onClick={() => navigate('/lobby')} className="text-yellow-500 underline text-sm">← Back to lobby</button>
      </div>
    </div>
  );

  // ── Emit helpers ───────────────────────────────────────────────────────────

  const emit = {
    drawCard:    ()           => socket.emit('game:draw_card'),
    playCard:    (id: string) => socket.emit('game:play_card',            { instanceId: id }),
    tapCard:     (id: string) => socket.emit('game:tap_card',             { instanceId: id }),
    endPhase:    ()           => socket.emit('game:end_phase'),
    endTurn:     ()           => socket.emit('game:end_turn'),
    updateLife:  (d: number)  => socket.emit('game:update_life',          { delta: d }),
    updateCmdDmg:(f: string, d: number) => socket.emit('game:update_commander_damage', { fromSocketId: f, delta: d }),
    toGraveyard: (id: string) => socket.emit('game:move_to_graveyard',    { instanceId: id }),
    toExile:     (id: string) => socket.emit('game:move_to_exile',        { instanceId: id }),
    returnCmd:   (id: string) => socket.emit('game:return_commander',     { instanceId: id }),
  };

  // ── Drag helpers ────────────────────────────────────────────────────────────

  function dragStart(e: React.DragEvent, instanceId: string, source: DragData['source']) {
    const data: DragData = { instanceId, source };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleBfDrop(data: DragData) {
    if (data.source === 'hand') emit.playCard(data.instanceId);
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const myCommander = me.commandZone[0];
  const lifeColor = me.life <= 0  ? '#dc2626' : me.life <= 10 ? '#f97316' : '#4ade80';

  return (
    <div
      className="h-screen flex flex-col overflow-hidden select-none"
      style={FELT}
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
    >
      {/* ── Header ── */}
      <header
        className="shrink-0 flex items-center gap-4 px-5"
        style={{
          height: 56,
          background: 'rgba(0,0,0,0.55)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Turn info */}
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: '#4b5563' }}>T{gameState.turn}</span>
          <span className="text-sm font-bold" style={{ color: isMyTurn ? '#facc15' : '#e5e7eb' }}>
            {isMyTurn ? '⚡ Your Turn' : `${active?.playerName}'s Turn`}
          </span>
        </div>

        <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* Phase tracker */}
        <div className="flex-1 overflow-x-auto">
          <PhaseTracker phase={gameState.phase} />
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-2">
          <button onClick={emit.drawCard}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#d1d5db',
            }}>
            Draw Card
          </button>
          {isMyTurn && (
            <>
              <button onClick={emit.endPhase}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#d1d5db' }}>
                Next Phase →
              </button>
              <button onClick={emit.endTurn}
                className="text-xs font-bold px-3 py-1.5 rounded-lg transition"
                style={{
                  background: 'linear-gradient(135deg, #d97706, #b45309)',
                  boxShadow: '0 0 12px rgba(217,119,6,0.4)',
                  color: '#111',
                }}>
                End Turn ⏭
              </button>
            </>
          )}
          <button onClick={() => setShowLog(!showLog)}
            className="text-xs px-2 py-1.5 rounded-lg transition"
            style={{ color: showLog ? '#9ca3af' : '#4b5563' }}>
            Log {showLog ? '▾' : '▸'}
          </button>
          <button onClick={() => navigate('/lobby')}
            className="text-xs px-2 py-1.5 rounded-lg transition hover:text-red-400"
            style={{ color: '#4b5563' }}>
            ✕
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Opponents */}
        <div className="shrink-0 flex gap-2 p-2" style={{ height: 220 }}>
          {opponents.map((p) => (
            <OpponentZone key={p.socketId} player={p}
              onHover={setHoverCard} onHoverEnd={() => setHoverCard(null)} />
          ))}
          {opponents.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm italic"
              style={{ color: '#1f4a2e' }}>
              Waiting for opponents…
            </div>
          )}
        </div>

        {/* Middle: damage matrix + log */}
        <div className="flex gap-3 px-3 pb-2 overflow-hidden min-h-0" style={{ flex: '1 1 0' }}>
          <CmdDamageMatrix players={gameState.players} mySocketId={mySocketId} onUpdate={emit.updateCmdDmg} />
          {showLog && (
            <div className="flex-1 overflow-y-auto rounded-xl p-3 min-h-0 flex flex-col gap-0.5"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Game Log
              </p>
              {gameState.log.map((entry, i) => (
                <p key={i} className="text-xs leading-relaxed"
                  style={{ color: i === 0 ? '#d1d5db' : '#4b5563' }}>
                  {entry}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* ── My Zone ── */}
        <div
          className="shrink-0 flex flex-col"
          style={{
            height: 350,
            borderTop: '2px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.4)',
          }}
        >
          {/* My info bar */}
          <div
            className="shrink-0 flex items-center gap-5 px-5 py-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', height: 80 }}
          >
            {/* Huge life total */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => emit.updateLife(-1)}
                className="w-9 h-9 rounded-xl font-black text-lg transition hover:scale-110"
                style={{ background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5' }}>
                −
              </button>
              <div className="text-center" style={{ minWidth: '4.5rem' }}>
                <span className="font-black font-mono tabular-nums"
                  style={{ fontSize: '5rem', lineHeight: 1, color: lifeColor,
                    textShadow: `0 0 20px ${lifeColor}66, 0 2px 4px rgba(0,0,0,0.8)` }}>
                  {me.life}
                </span>
              </div>
              <button onClick={() => emit.updateLife(1)}
                className="w-9 h-9 rounded-xl font-black text-lg transition hover:scale-110"
                style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#86efac' }}>
                +
              </button>
            </div>

            {/* Commander portrait */}
            {myCommander && (
              <div className="flex items-center gap-3 shrink-0"
                style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 20 }}>
                <div
                  className="rounded-lg overflow-hidden shrink-0 cursor-pointer"
                  style={{ width: 38, height: 54, border: '1px solid rgba(250,204,21,0.4)',
                    boxShadow: '0 0 10px rgba(250,204,21,0.2)' }}
                  onMouseEnter={() => setHoverCard(myCommander)}
                  onMouseLeave={() => setHoverCard(null)}
                >
                  {myCommander.imageUri
                    ? <img src={myCommander.imageUri} className="w-full h-full object-cover" />
                    : <CardBack style={{ width: '100%', height: '100%' }} />}
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#f59e0b' }}>Commander</p>
                  <p className="text-sm font-semibold max-w-[130px] truncate" style={{ color: '#f3f4f6' }}>
                    {myCommander.name}
                  </p>
                </div>
              </div>
            )}

            {/* Player name + status */}
            <div className="flex items-center gap-2"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 20 }}>
              {isMyTurn && (
                <span className="w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{ background: '#facc15', boxShadow: '0 0 6px #facc15' }} />
              )}
              <span className="text-base font-bold" style={{ color: '#f9fafb' }}>{me.playerName}</span>
            </div>

            {/* Zone counts */}
            <div className="ml-auto flex items-center gap-5 text-sm font-semibold shrink-0"
              style={{ color: '#4b5563' }}>
              <span title="Library">📚 {me.libraryCount}</span>
              <span title="Hand">✋ {me.handCount}</span>
              <span title={`${me.graveyard.length} cards in graveyard`}>🪦 {me.graveyard.length}</span>
              <span title={`${me.exile.length} cards exiled`}>✦ {me.exile.length}</span>
            </div>
          </div>

          {/* Battlefield + side zones */}
          <div className="flex-1 flex gap-2 px-3 py-2 overflow-hidden min-h-0">

            {/* Main battlefield drop zone */}
            <DropZone
              label="Battlefield"
              accept={['hand']}
              isOver={overBf}
              onDragOver={() => setOverBf(true)}
              onDragLeave={() => setOverBf(false)}
              onDrop={(data) => { setOverBf(false); handleBfDrop(data); }}
              className="flex-1 overflow-hidden"
            >
              <div className="w-full h-full overflow-x-auto flex items-center gap-2 px-3 pt-7 pb-2">
                {me.battlefield.length === 0 && !overBf ? (
                  <p className="text-sm italic w-full text-center pointer-events-none"
                    style={{ color: 'rgba(255,255,255,0.1)' }}>
                    Drag cards from hand to play them here
                  </p>
                ) : (
                  me.battlefield.map((card) => (
                    <MyBattlefieldCard
                      key={card.instanceId}
                      card={card}
                      onTap={() => emit.tapCard(card.instanceId)}
                      onGraveyard={() => emit.toGraveyard(card.instanceId)}
                      onExile={() => emit.toExile(card.instanceId)}
                      onReturnCommander={() => emit.returnCmd(card.instanceId)}
                      onDragStart={(e) => dragStart(e, card.instanceId, 'battlefield')}
                      onHover={setHoverCard}
                      onHoverEnd={() => setHoverCard(null)}
                    />
                  ))
                )}
              </div>
            </DropZone>

            {/* Graveyard + Exile piles */}
            <div className="shrink-0 flex flex-col gap-3 justify-center py-1">
              <PileZone
                cards={me.graveyard}
                label="Graveyard"
                isOver={overGy}
                onDragOver={() => setOverGy(true)}
                onDragLeave={() => setOverGy(false)}
                onDrop={(data) => { setOverGy(false); emit.toGraveyard(data.instanceId); }}
                onHover={setHoverCard}
                onHoverEnd={() => setHoverCard(null)}
                accentColor="#9ca3af"
              />
              <PileZone
                cards={me.exile}
                label="Exile"
                isOver={overEx}
                onDragOver={() => setOverEx(true)}
                onDragLeave={() => setOverEx(false)}
                onDrop={(data) => { setOverEx(false); emit.toExile(data.instanceId); }}
                onHover={setHoverCard}
                onHoverEnd={() => setHoverCard(null)}
                accentColor="#a78bfa"
              />
            </div>
          </div>

          {/* Hand */}
          <div
            className="shrink-0 flex items-end gap-1.5 px-5 pb-2 pt-1 overflow-x-auto"
            style={{
              height: 112,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(0,0,0,0.25)',
            }}
          >
            {me.hand.length === 0 ? (
              <p className="text-xs italic self-center w-full text-center" style={{ color: 'rgba(255,255,255,0.1)' }}>
                Hand empty — click Draw Card to draw
              </p>
            ) : (
              me.hand.map((card) => (
                <div
                  key={card.instanceId}
                  draggable
                  onDragStart={(e) => dragStart(e, card.instanceId, 'hand')}
                  onClick={() => emit.playCard(card.instanceId)}
                  onMouseEnter={() => setHoverCard(card)}
                  onMouseLeave={() => setHoverCard(null)}
                  className="shrink-0 transition-transform duration-150 origin-bottom"
                  style={{
                    width: 60,
                    cursor: 'grab',
                    transform: 'translateY(0)',
                  }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-16px) scale(1.08)';
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0) scale(1)';
                    setHoverCard(null);
                  }}
                  title={`${card.name} — drag to battlefield or click to play`}
                >
                  {card.imageUri ? (
                    <img src={card.imageUri} alt={card.name}
                      className="w-full rounded-xl"
                      style={{
                        boxShadow: '0 8px 20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)',
                      }} />
                  ) : (
                    <CardBack style={{ width: 60, height: 84 }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Global card hover preview */}
      {hoverCard && <HoverPreview card={hoverCard} x={mouse.x} y={mouse.y} />}
    </div>
  );
}
