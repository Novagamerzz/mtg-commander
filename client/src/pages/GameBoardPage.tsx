import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import type { PersonalGameState, PersonalPlayerState, GameCard, TurnPhase } from '@mtg-commander/types';

// ── Zone viewer modal ─────────────────────────────────────────────────────────

interface ZoneAction {
  label: string;
  color?: string;
  onCard: (card: GameCard) => void;
}

function ZoneModal({ title, cards, loading = false, actions, onClose }: {
  title: string; cards: GameCard[]; loading?: boolean;
  actions: ZoneAction[]; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = cards.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}>
      <div className="flex flex-col rounded-2xl overflow-hidden"
        style={{ width: '82vw', maxWidth: 960, maxHeight: '88vh', background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 80px rgba(0,0,0,0.9)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-lg font-bold text-white flex-1">{title}
            <span className="text-sm font-normal ml-2" style={{ color: '#6b7280' }}>({cards.length} cards)</span>
          </h2>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter cards…" autoFocus
            className="text-sm px-3 py-1.5 rounded-lg focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', width: 180 }} />
          <button onClick={onClose} className="text-xl w-8 h-8 flex items-center justify-center rounded-lg transition hover:bg-white/10"
            style={{ color: '#6b7280' }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-yellow-500/40 border-t-yellow-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-16 text-sm" style={{ color: '#374151' }}>
              {search ? `No cards matching "${search}"` : 'No cards here'}
            </p>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
              {filtered.map((card) => (
                <div key={card.instanceId} className="flex flex-col gap-2">
                  <div className="relative rounded-xl overflow-hidden" style={{ paddingBottom: '140%' }}>
                    {card.imageUri ? (
                      <img src={card.imageUri} alt={card.name} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-2"
                        style={{ background: '#1e293b', border: '1px solid #334155' }}>
                        <span className="text-xs text-center" style={{ color: '#64748b' }}>{card.name}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium truncate" style={{ color: '#cbd5e1' }} title={card.name}>{card.name}</p>
                  <div className="flex flex-col gap-1">
                    {actions.map((action) => (
                      <button key={action.label} onClick={() => { action.onCard(card); onClose(); }}
                        className="text-xs py-1 px-2 rounded-lg transition font-medium text-left"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: action.color ?? '#9ca3af' }}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Commander replacement popup (EDH rule) ────────────────────────────────────

function CommanderReplacementPopup({ cardName, destination, onCommandZone, onStay }: {
  cardName: string;
  destination: 'graveyard' | 'exile';
  onCommandZone: () => void;
  onStay: () => void;
}) {
  const destLabel = destination === 'graveyard' ? 'Graveyard' : 'Exile';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
      <div className="rounded-2xl p-7 max-w-sm w-full mx-4"
        style={{ background: '#0c1a0e', border: '2px solid rgba(250,204,21,0.35)',
          boxShadow: '0 0 60px rgba(250,204,21,0.12), 0 40px 80px rgba(0,0,0,0.9)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">⚜</span>
          <h2 className="text-lg font-bold" style={{ color: '#facc15' }}>Commander Replacement</h2>
        </div>
        <p className="text-sm mb-1" style={{ color: '#e5e7eb' }}>
          <span className="font-semibold text-white">{cardName}</span> would go to the {destLabel}.
        </p>
        <p className="text-xs mb-1" style={{ color: '#6b7280' }}>
          As your commander, you may redirect it to your command zone instead.
        </p>
        <p className="text-xs mb-6 italic" style={{ color: '#4b5563' }}>
          Returning to command zone does not count as dying. The next cast will cost {'{'}2{'}'} more.
        </p>
        <div className="flex flex-col gap-2.5">
          <button onClick={onCommandZone}
            className="w-full py-3 rounded-xl font-bold text-sm transition hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #92400e, #78350f)',
              color: '#fbbf24', border: '1px solid rgba(250,204,21,0.4)',
              boxShadow: '0 0 16px rgba(250,204,21,0.2)' }}>
            ⚜ Return to Command Zone
          </button>
          <button onClick={onStay}
            className="w-full py-3 rounded-xl font-semibold text-sm transition hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af',
              border: '1px solid rgba(255,255,255,0.1)' }}>
            Stay in {destLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Battlefield row organisation ──────────────────────────────────────────────

const TYPE_ROWS: { label: string; match: (t: string) => boolean }[] = [
  { label: 'Lands',                  match: (t) => t.includes('Land') },
  { label: 'Enchantments/Artifacts', match: (t) => !t.includes('Land') && !t.includes('Creature') && (t.includes('Enchantment') || t.includes('Artifact')) },
  { label: 'Creatures',              match: (t) => t.includes('Creature') },
  { label: 'Planeswalkers',          match: (t) => t.includes('Planeswalker') && !t.includes('Creature') },
  { label: 'Other',                  match: (_) => true },
];

function groupByType(cards: GameCard[]): { label: string; cards: GameCard[] }[] {
  const assigned = new Set<string>();
  const rows: { label: string; cards: GameCard[] }[] = [];
  for (const { label, match } of TYPE_ROWS) {
    const rowCards = cards.filter((c) => !assigned.has(c.instanceId) && match(c.typeLine));
    rowCards.forEach((c) => assigned.add(c.instanceId));
    if (rowCards.length > 0) rows.push({ label, cards: rowCards });
  }
  return rows;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASES: { key: TurnPhase; label: string }[] = [
  { key: 'untap',  label: 'Untap'  },
  { key: 'upkeep', label: 'Upkeep' },
  { key: 'draw',   label: 'Draw'   },
  { key: 'main1',  label: 'Main 1' },
  { key: 'combat', label: 'Combat' },
  { key: 'main2',  label: 'Main 2' },
  { key: 'end',    label: 'End'    },
];

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
    <div className="rounded-lg shrink-0 select-none flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2040 40%, #1a1060 100%)',
        border: '1px solid rgba(100,130,200,0.3)', boxShadow: 'inset 0 0 8px rgba(0,0,100,0.4)', ...style }}>
      <div style={{ width: '70%', height: '70%', borderRadius: 4,
        border: '1px solid rgba(150,170,220,0.2)',
        background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(80,100,180,0.08) 4px, rgba(80,100,180,0.08) 8px)' }} />
    </div>
  );
}

// ── Hover preview ─────────────────────────────────────────────────────────────

function HoverPreview({ card, x, y }: { card: GameCard; x: number; y: number }) {
  if (!card.imageUri) return null;
  const W = 240, H = 336;
  const left = x + W + 24 > window.innerWidth ? x - W - 12 : x + 16;
  const top  = Math.max(8, Math.min(y - 80, window.innerHeight - H - 8));
  return (
    <div style={{ position: 'fixed', left, top, width: W, zIndex: 9999, pointerEvents: 'none' }}>
      <img src={card.imageUri} alt={card.name} className="w-full rounded-2xl shadow-2xl"
        style={{ border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 30px 60px rgba(0,0,0,0.8)' }} />
      <p className="text-center text-xs text-gray-400 mt-1 font-medium">{card.name}</p>
    </div>
  );
}

// ── Phase tracker ─────────────────────────────────────────────────────────────

function PhaseTracker({ phase }: { phase: TurnPhase }) {
  return (
    <div className="flex items-center gap-0.5">
      {PHASES.map(({ key, label }) => {
        const active = phase === key;
        return (
          <span key={key}
            className={`text-xs font-bold px-2.5 py-1.5 rounded-md transition-all duration-200 select-none ${active ? 'text-gray-950' : 'text-gray-600'}`}
            style={active ? { background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 100%)', boxShadow: '0 0 14px rgba(250,204,21,0.6)', transform: 'scale(1.12)' } : {}}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

// ── Tapped card wrapper ───────────────────────────────────────────────────────

function TappedCardWrapper({ card, cardW, cardH, children, className = '' }: {
  card: GameCard; cardW: number; cardH: number; children: React.ReactNode; className?: string;
}) {
  const w = card.tapped ? cardH : cardW;
  const h = card.tapped ? cardW : cardH;
  return (
    <div className={`relative shrink-0 ${className}`}
      style={{ width: w, height: h, transition: 'width 0.2s, height 0.2s' }}>
      <div style={{
        position: 'absolute', width: cardW, height: cardH,
        top:  card.tapped ? (cardW - cardH) / 2 : 0,
        left: card.tapped ? (cardH - cardW) / 2 : 0,
        transform: card.tapped ? 'rotate(90deg)' : 'none',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        transformOrigin: 'center center',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Opponent zone ─────────────────────────────────────────────────────────────

function OpponentZone({ player, onHover, onHoverEnd }: {
  player: PersonalPlayerState;
  onHover: (c: GameCard) => void;
  onHoverEnd: () => void;
}) {
  const commander = player.commandZone[0];
  const life = player.life;
  const lifeColor = life <= 0 ? '#dc2626' : life <= 10 ? '#f97316' : '#f9fafb';

  // Group battlefield by type for opponents too
  const rows = groupByType(player.battlefield);

  return (
    <div className="flex-1 min-w-0 rounded-xl flex flex-col overflow-hidden"
      style={{
        border: player.isActive ? '2px solid rgba(250,204,21,0.8)' : '1px solid rgba(255,255,255,0.08)',
        background: player.isActive ? 'rgba(250,204,21,0.04)' : 'rgba(0,0,0,0.35)',
        boxShadow: player.isActive ? '0 0 24px rgba(250,204,21,0.15)' : 'none',
      }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {player.isActive && (
            <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse"
              style={{ background: '#facc15', boxShadow: '0 0 6px #facc15' }} />
          )}
          <span className="font-bold text-xl text-white truncate">{player.playerName}</span>
          {commander && <span className="text-xs truncate hidden md:block" style={{ color: '#f59e0b' }}>⚜ {commander.name.split(',')[0]}</span>}
        </div>
        {/* Larger, more readable life total */}
        <span className="font-black font-mono tabular-nums shrink-0"
          style={{ fontSize: '3rem', lineHeight: 1, color: lifeColor,
            textShadow: life <= 10 ? `0 0 12px ${lifeColor}88` : 'none' }}>
          {life}
        </span>
      </div>

      {/* Hand: styled face-down backs */}
      {player.handCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex gap-0.5 items-end">
            {Array.from({ length: Math.min(player.handCount, 14) }).map((_, i) => (
              <CardBack key={i} style={{ width: 22, height: 30,
                transform: `rotate(${(i - Math.min(player.handCount, 14) / 2) * 2}deg)` }} />
            ))}
          </div>
          <span className="text-xs font-semibold ml-1" style={{ color: '#6b7280' }}>
            {player.handCount} in hand
          </span>
        </div>
      )}

      {/* Battlefield — rows by type */}
      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-[10px] italic text-center self-center" style={{ color: '#2d4a38' }}>Empty</p>
        ) : (
          rows.map(({ label, cards }) => (
            <div key={label} className="flex items-start gap-1">
              {/* Row label */}
              <span className="text-[8px] font-bold uppercase tracking-widest shrink-0 pt-1 w-12 text-right pr-1"
                style={{ color: 'rgba(255,255,255,0.18)' }}>
                {label.split('/')[0]}
              </span>
              {/* Cards — larger thumbnails (46×66) */}
              <div className="flex flex-wrap gap-1.5" style={{ minHeight: 70 }}>
                {cards.map((card) => (
                  <TappedCardWrapper key={card.instanceId} card={card} cardW={46} cardH={66}>
                    <div onMouseEnter={() => onHover(card)} onMouseLeave={onHoverEnd} className="w-full h-full cursor-default">
                      {card.imageUri ? (
                        <img src={card.imageUri} className="w-full h-full object-cover rounded"
                          style={{ opacity: card.tapped ? 0.72 : 1,
                            border: card.tapped ? '1px solid rgba(250,204,21,0.4)' : '1px solid rgba(255,255,255,0.1)',
                            boxShadow: card.tapped ? '0 0 6px rgba(250,204,21,0.2)' : 'none' }} />
                      ) : (
                        <div className="w-full h-full rounded flex items-center justify-center p-0.5"
                          style={{ background: '#1f2937', border: '1px solid #374151' }}>
                          <span style={{ fontSize: 7, color: '#6b7280', textAlign: 'center' }}>{card.name.slice(0, 10)}</span>
                        </div>
                      )}
                    </div>
                  </TappedCardWrapper>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Zone counts */}
      <div className="flex items-center gap-4 px-3 py-1.5 text-xs font-semibold shrink-0"
        style={{ color: '#4b5563', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <span>📚 {player.libraryCount}</span>
        <span>🪦 {player.graveyard.length}</span>
        <span>✦ {player.exile.length}</span>
        {player.poisonCounters > 0 && <span style={{ color: '#16a34a' }}>☠ {player.poisonCounters}</span>}
      </div>
    </div>
  );
}

// ── Drop zone (battlefield) ───────────────────────────────────────────────────

function DropZone({ label, accept, onDrop, isOver, onDragOver, onDragLeave, children, style, className = '' }: {
  label: string; accept: DragData['source'][]; onDrop: (d: DragData) => void;
  isOver: boolean; onDragOver: () => void; onDragLeave: () => void;
  children: React.ReactNode; style?: React.CSSProperties; className?: string;
}) {
  return (
    <div className={`relative rounded-xl transition-all duration-150 ${className}`}
      style={{
        border: isOver ? '2px solid rgba(134,239,172,0.7)' : '2px dashed rgba(255,255,255,0.08)',
        background: isOver ? 'rgba(134,239,172,0.06)' : 'rgba(0,0,0,0.15)',
        boxShadow: isOver ? '0 0 20px rgba(134,239,172,0.15), inset 0 0 20px rgba(134,239,172,0.05)' : 'none',
        ...style,
      }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const data: DragData = JSON.parse(e.dataTransfer.getData('application/json'));
          if (accept.includes(data.source)) onDrop(data);
        } catch { /* */ }
      }}>
      {/* Zone label */}
      <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-10" style={{ top: 6 }}>
        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ color: isOver ? 'rgba(134,239,172,0.9)' : 'rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.4)' }}>
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

// ── Pile zone (graveyard / exile) ─────────────────────────────────────────────

function PileZone({ cards, label, isOver, onDragOver, onDragLeave, onDrop, onHover, onHoverEnd, accentColor, onClick }: {
  cards: GameCard[]; label: string; isOver: boolean;
  onDragOver: () => void; onDragLeave: () => void; onDrop: (d: DragData) => void;
  onHover: (c: GameCard) => void; onHoverEnd: () => void;
  accentColor: string; onClick?: () => void;
}) {
  const topCard = cards[cards.length - 1];
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.22)' }}>{label}</span>
      <div className="relative rounded-lg overflow-hidden transition-all duration-150"
        onClick={onClick}
        style={{
          cursor: onClick ? 'pointer' : 'default', width: 52, height: 74,
          border: isOver ? `2px solid ${accentColor}` : '2px dashed rgba(255,255,255,0.12)',
          background: isOver ? `${accentColor}18` : 'rgba(0,0,0,0.3)',
          boxShadow: isOver ? `0 0 12px ${accentColor}44` : 'none', flexShrink: 0,
        }}
        onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          try { const d: DragData = JSON.parse(e.dataTransfer.getData('application/json')); onDrop(d); } catch { /* */ }
        }}
        onMouseEnter={() => topCard && onHover(topCard)} onMouseLeave={onHoverEnd}>
        {topCard?.imageUri ? (
          <img src={topCard.imageUri} className="w-full h-full object-cover opacity-90" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <span className="text-xl" style={{ opacity: 0.3 }}>{label === 'Graveyard' ? '🪦' : '✦'}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 py-0.5 text-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <span className="text-xs font-bold" style={{ color: accentColor }}>{cards.length}</span>
        </div>
      </div>
    </div>
  );
}

// ── My battlefield card ───────────────────────────────────────────────────────

function MyBattlefieldCard({ card, onTap, onGraveyard, onExile, onReturnCommander, onDragStart, onHover, onHoverEnd }: {
  card: GameCard; onTap: () => void; onGraveyard: () => void; onExile: () => void;
  onReturnCommander: () => void; onDragStart: (e: React.DragEvent) => void;
  onHover: (c: GameCard) => void; onHoverEnd: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const CARD_W = 58, CARD_H = 84;
  return (
    <TappedCardWrapper card={card} cardW={CARD_W} cardH={CARD_H} className="group">
      <div draggable onDragStart={(e) => { onDragStart(e); setMenu(false); }}
        onClick={onTap} onMouseEnter={() => onHover(card)} onMouseLeave={() => onHoverEnd()}
        className="w-full h-full" style={{ cursor: card.tapped ? 'pointer' : 'grab' }}>
        {card.imageUri ? (
          <img src={card.imageUri} alt={card.name} className="w-full h-full object-cover rounded-lg"
            style={{
              boxShadow: card.tapped ? '0 0 10px rgba(250,204,21,0.4)' : '0 4px 10px rgba(0,0,0,0.6)',
              border: card.tapped ? '1.5px solid rgba(250,204,21,0.5)' : '1px solid rgba(255,255,255,0.1)',
              opacity: card.tapped ? 0.82 : 1,
            }} />
        ) : (
          <div className="w-full h-full rounded-lg flex items-center justify-center p-1"
            style={{ background: '#1f2937', border: '1px solid #374151' }}>
            <span className="text-[9px] text-center leading-tight" style={{ color: '#6b7280' }}>{card.name}</span>
          </div>
        )}
      </div>
      <button
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition z-20"
        style={{ background: '#374151', border: '1px solid #4b5563', color: '#d1d5db' }}
        onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}>⋮</button>
      {menu && (
        <div className="absolute top-4 right-0 rounded-xl py-1 z-30 overflow-hidden"
          style={{ width: 138, background: '#111827', border: '1px solid #374151', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}
          onClick={(e) => e.stopPropagation()}>
          {[
            { label: card.tapped ? '↺ Untap' : '↻ Tap', action: () => { onTap(); setMenu(false); }, color: '#d1d5db' },
            { label: '→ Graveyard', action: () => { onGraveyard(); setMenu(false); }, color: '#9ca3af' },
            { label: '→ Exile',     action: () => { onExile(); setMenu(false); },     color: '#a78bfa' },
            { label: '⚜ Cmd Zone',  action: () => { onReturnCommander(); setMenu(false); }, color: '#f59e0b' },
          ].map(({ label, action, color }) => (
            <button key={label} onClick={action}
              className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition"
              style={{ color }}>{label}</button>
          ))}
        </div>
      )}
    </TappedCardWrapper>
  );
}

// ── Battlefield rows (type-organised) ────────────────────────────────────────

function BattlefieldRows({ cards, onTap, onGraveyard, onExile, onReturnCommander, onDragStart, onHover, onHoverEnd }: {
  cards: GameCard[];
  onTap: (id: string) => void;
  onGraveyard: (id: string) => void;
  onExile: (id: string) => void;
  onReturnCommander: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onHover: (c: GameCard) => void;
  onHoverEnd: () => void;
}) {
  const rows = groupByType(cards);
  if (cards.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center pointer-events-none">
        <p className="text-sm italic" style={{ color: 'rgba(255,255,255,0.07)' }}>Drag cards from hand to play here</p>
      </div>
    );
  }
  return (
    <div className="w-full h-full overflow-y-auto flex flex-col gap-1 px-2 pb-2 pt-7">
      {rows.map(({ label, cards: rowCards }) => (
        <div key={label} className="flex items-start gap-1" style={{ minHeight: 96 }}>
          {/* Left row label */}
          <div className="shrink-0 w-[68px] text-right pr-2 pt-2">
            <span className="text-[8px] font-bold uppercase tracking-widest leading-tight"
              style={{ color: 'rgba(255,255,255,0.2)' }}>
              {label.replace('/', '/\n')}
            </span>
          </div>
          {/* Cards — wrap within row so tapped cards never overlap */}
          <div className="flex flex-wrap gap-2.5 flex-1 min-w-0 p-1" style={{ alignContent: 'flex-start' }}>
            {rowCards.map((card) => (
              <MyBattlefieldCard
                key={card.instanceId}
                card={card}
                onTap={() => onTap(card.instanceId)}
                onGraveyard={() => onGraveyard(card.instanceId)}
                onExile={() => onExile(card.instanceId)}
                onReturnCommander={() => onReturnCommander(card.instanceId)}
                onDragStart={(e) => onDragStart(e, card.instanceId)}
                onHover={onHover}
                onHoverEnd={onHoverEnd}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Commander damage matrix ───────────────────────────────────────────────────

function CmdDamageMatrix({ players, mySocketId, onUpdate }: {
  players: PersonalPlayerState[]; mySocketId: string;
  onUpdate: (from: string, delta: number) => void;
}) {
  const me = players.find((p) => p.socketId === mySocketId);
  if (!me || players.filter((p) => p.socketId !== mySocketId).length === 0) return null;
  return (
    <div className="rounded-xl p-3 shrink-0"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)', minWidth: 180 }}>
      <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
        Cmd Damage → You
      </p>
      <div className="flex flex-col gap-2.5">
        {players.filter((p) => p.socketId !== mySocketId).map((src) => {
          const dmg = me.commanderDamage[src.socketId] ?? 0;
          const lethal = dmg >= 21, warn = dmg >= 17;
          const color = lethal ? '#ef4444' : warn ? '#f97316' : '#d1d5db';
          const cmdName = (src.commandZone[0]?.name ?? src.playerName).split(',')[0];
          return (
            <div key={src.socketId}>
              <p className="text-[10px] truncate mb-0.5" style={{ color: '#6b7280' }} title={cmdName}>{cmdName}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => onUpdate(src.socketId, -1)}
                  className="w-5 h-5 rounded flex items-center justify-center text-sm transition hover:bg-white/10"
                  style={{ color: '#6b7280' }}>−</button>
                <span className="font-black font-mono tabular-nums w-7 text-center text-lg"
                  style={{ color, textShadow: lethal ? '0 0 10px #ef4444' : 'none' }}>{dmg}</span>
                <button onClick={() => onUpdate(src.socketId, 1)}
                  className="w-5 h-5 rounded flex items-center justify-center text-sm transition hover:bg-white/10"
                  style={{ color: '#6b7280' }}>+</button>
                {lethal && <span className="text-[9px] font-bold animate-pulse" style={{ color: '#ef4444' }}>LETHAL</span>}
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
  const [showLog, setShowLog] = useState(false);
  const [hoverCard, setHoverCard] = useState<GameCard | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [overBf, setOverBf] = useState(false);
  const [overGy, setOverGy] = useState(false);
  const [overEx, setOverEx] = useState(false);

  // Zone modals
  const [zoneModal, setZoneModal] = useState<'graveyard' | 'exile' | 'library' | null>(null);
  const [libraryCards, setLibraryCards] = useState<GameCard[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Commander replacement popup (EDH rule)
  const [commanderPopup, setCommanderPopup] = useState<{
    cardName: string; instanceId: string; destination: 'graveyard' | 'exile';
  } | null>(null);
  const commanderScryfallId = useRef<string | null>(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    socket.on('game:state', setGameState);
    socket.on('game:library_contents', (cards) => { setLibraryCards(cards); setLibraryLoading(false); });
    socket.emit('game:rejoin');
    return () => { socket.off('game:state', setGameState); socket.off('game:library_contents'); };
  }, []);

  // Track commander scryfallId so we can identify it when it's on the battlefield
  useEffect(() => {
    const me = gameState?.players.find((p) => p.socketId === gameState.mySocketId);
    if (me?.commandZone.length && !commanderScryfallId.current) {
      commanderScryfallId.current = me.commandZone[0].scryfallId;
    }
  }, [gameState]);

  function openLibraryModal() {
    setZoneModal('library'); setLibraryCards([]); setLibraryLoading(true);
    socket.emit('game:request_library');
  }

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

  const mySocketId  = gameState.mySocketId;
  const me          = gameState.players.find((p) => p.socketId === mySocketId);
  const opponents   = gameState.players.filter((p) => p.socketId !== mySocketId);
  const active      = gameState.players[gameState.activePlayerIndex];
  const isMyTurn    = active?.socketId === mySocketId;

  if (!me) return (
    <div className="h-screen flex items-center justify-center" style={FELT}>
      <div className="text-center">
        <p className="text-gray-400 mb-3">Could not find your player.</p>
        <button onClick={() => navigate('/lobby')} className="text-yellow-500 underline text-sm">← Back to lobby</button>
      </div>
    </div>
  );

  // ── Emit helpers ────────────────────────────────────────────────────────────

  const emit = {
    drawCard:    ()           => socket.emit('game:draw_card'),
    playCard:    (id: string) => socket.emit('game:play_card',            { instanceId: id }),
    tapCard:     (id: string) => socket.emit('game:tap_card',             { instanceId: id }),
    endPhase:    ()           => socket.emit('game:end_phase'),
    endTurn:     ()           => socket.emit('game:end_turn'),
    updateLife:  (d: number)  => socket.emit('game:update_life',          { delta: d }),
    updateCmdDmg:(f: string, d: number) => socket.emit('game:update_commander_damage', { fromSocketId: f, delta: d }),
    toGraveyard:   (id: string) => socket.emit('game:move_to_graveyard',    { instanceId: id }),
    toExile:       (id: string) => socket.emit('game:move_to_exile',        { instanceId: id }),
    toHand:        (id: string) => socket.emit('game:move_to_hand',         { instanceId: id }),
    returnToBf:    (id: string) => socket.emit('game:return_to_battlefield', { instanceId: id }),
    returnCmd:     (id: string) => socket.emit('game:return_commander',     { instanceId: id }),
    castCommander: ()           => socket.emit('game:cast_commander'),
    tutor:         (id: string, to: 'hand' | 'battlefield') => socket.emit('game:tutor', { instanceId: id, to }),
  };

  // ── Commander replacement interception (EDH rule) ───────────────────────────

  function interceptGraveyard(instanceId: string) {
    const card = me.battlefield.find((c) => c.instanceId === instanceId);
    if (card && commanderScryfallId.current && card.scryfallId === commanderScryfallId.current) {
      setCommanderPopup({ cardName: card.name, instanceId, destination: 'graveyard' });
    } else {
      emit.toGraveyard(instanceId);
    }
  }

  function interceptExile(instanceId: string) {
    const card = me.battlefield.find((c) => c.instanceId === instanceId);
    if (card && commanderScryfallId.current && card.scryfallId === commanderScryfallId.current) {
      setCommanderPopup({ cardName: card.name, instanceId, destination: 'exile' });
    } else {
      emit.toExile(instanceId);
    }
  }

  // ── Drag helpers ────────────────────────────────────────────────────────────

  function dragStart(e: React.DragEvent, instanceId: string, source: DragData['source']) {
    const data: DragData = { instanceId, source };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const myCommander = me.commandZone[0];
  const lifeColor   = me.life <= 0 ? '#dc2626' : me.life <= 10 ? '#f97316' : '#4ade80';
  const tax         = me.commanderCastCount * 2;
  const taxLabel    = tax === 0 ? 'No tax' : `+${tax} mana tax`;
  const taxColor    = tax === 0 ? '#4b5563' : tax >= 4 ? '#ef4444' : '#f97316';

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none" style={FELT}
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}>

      {/* ── Header ── */}
      <header className="shrink-0 flex items-center gap-4 px-5"
        style={{ height: 52, background: 'rgba(0,0,0,0.55)',
          borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)' }}>
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: '#4b5563' }}>T{gameState.turn}</span>
          <span className="text-sm font-bold" style={{ color: isMyTurn ? '#facc15' : '#e5e7eb' }}>
            {isMyTurn ? '⚡ Your Turn' : `${active?.playerName}'s Turn`}
          </span>
        </div>
        <div className="w-px h-5 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />
        <div className="flex-1 overflow-x-auto"><PhaseTracker phase={gameState.phase} /></div>
        <div className="shrink-0 flex items-center gap-2">
          <button onClick={emit.drawCard} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#d1d5db' }}>
            Draw
          </button>
          {isMyTurn && (
            <>
              <button onClick={emit.endPhase} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#d1d5db' }}>
                Next Phase →
              </button>
              <button onClick={emit.endTurn} className="text-xs font-bold px-3 py-1.5 rounded-lg transition"
                style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', boxShadow: '0 0 12px rgba(217,119,6,0.4)', color: '#111' }}>
                End Turn ⏭
              </button>
            </>
          )}
          <button onClick={() => setShowLog(!showLog)} className="text-xs px-2 py-1.5 rounded-lg"
            style={{ color: showLog ? '#9ca3af' : '#4b5563' }}>Log {showLog ? '▾' : '▸'}</button>
          <button onClick={() => navigate('/lobby')} className="text-xs px-2 py-1.5 transition hover:text-red-400"
            style={{ color: '#4b5563' }}>✕</button>
        </div>
      </header>

      {/* ── Body: 60% opponents / 40% me ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Opponents — 60% */}
        <div className="flex gap-2 p-2 overflow-hidden" style={{ flex: '0 0 60%' }}>
          {opponents.map((p) => (
            <OpponentZone key={p.socketId} player={p}
              onHover={setHoverCard} onHoverEnd={() => setHoverCard(null)} />
          ))}
          {opponents.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm italic" style={{ color: '#1f4a2e' }}>
              Waiting for opponents…
            </div>
          )}
        </div>

        {/* My zone — 40% */}
        <div className="flex flex-col overflow-hidden" style={{
          flex: '0 0 40%', borderTop: '2px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.42)',
        }}>

          {/* Info bar */}
          <div className="shrink-0 flex items-center gap-4 px-4" style={{ height: 76, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>

            {/* Life */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => emit.updateLife(-1)}
                className="w-8 h-8 rounded-xl font-black text-lg transition hover:scale-110"
                style={{ background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5' }}>−</button>
              <div className="text-center" style={{ minWidth: '3.8rem' }}>
                <span className="font-black font-mono tabular-nums"
                  style={{ fontSize: '4rem', lineHeight: 1, color: lifeColor,
                    textShadow: `0 0 16px ${lifeColor}55, 0 2px 4px rgba(0,0,0,0.8)` }}>
                  {me.life}
                </span>
              </div>
              <button onClick={() => emit.updateLife(1)}
                className="w-8 h-8 rounded-xl font-black text-lg transition hover:scale-110"
                style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#86efac' }}>+</button>
            </div>

            {/* Commander */}
            <div className="flex items-center gap-2.5 shrink-0"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 16 }}>
              {myCommander && (
                <div className="rounded-lg overflow-hidden shrink-0 cursor-pointer"
                  style={{ width: 36, height: 50, border: '1px solid rgba(250,204,21,0.4)',
                    boxShadow: '0 0 10px rgba(250,204,21,0.2)' }}
                  onMouseEnter={() => setHoverCard(myCommander)}
                  onMouseLeave={() => setHoverCard(null)}>
                  {myCommander.imageUri
                    ? <img src={myCommander.imageUri} className="w-full h-full object-cover" />
                    : <CardBack style={{ width: '100%', height: '100%' }} />}
                </div>
              )}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#f59e0b' }}>Commander</p>
                {myCommander
                  ? <p className="text-sm font-semibold max-w-[110px] truncate" style={{ color: '#f3f4f6' }}>{myCommander.name}</p>
                  : <p className="text-xs" style={{ color: '#6b7280' }}>On battlefield</p>}
                {/* Tax display with tooltip */}
                <div className="flex items-center gap-1 mt-0.5" title={
                  tax === 0
                    ? 'Commander tax: no additional cost for first cast'
                    : `Commander tax: pay an additional ${tax} generic mana for each previous cast from command zone`
                }>
                  <span className="text-[9px] font-bold" style={{ color: taxColor }}>
                    {me.commanderCastCount === 0 ? 'No tax' : `Tax: +${tax}⧫`}
                  </span>
                  <span className="text-[8px]" style={{ color: '#374151' }}>(cast {me.commanderCastCount}×)</span>
                </div>
                {myCommander && (
                  <button onClick={emit.castCommander}
                    className="mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md transition hover:brightness-110"
                    style={{ background: 'linear-gradient(135deg, #92400e, #78350f)',
                      border: '1px solid rgba(250,204,21,0.3)', color: '#fbbf24',
                      boxShadow: '0 0 6px rgba(250,204,21,0.2)' }}>
                    ⚡ Cast Commander
                  </button>
                )}
              </div>
            </div>

            {/* Zone counts — clickable */}
            <div className="flex items-center gap-1.5 text-sm font-semibold"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 16 }}>
              <button onClick={openLibraryModal} title="Search library"
                className="flex items-center gap-1 px-2 py-1 rounded-lg transition hover:bg-white/10"
                style={{ color: '#4b5563' }}>📚 {me.libraryCount}</button>
              <span style={{ color: '#374151' }}>✋ {me.handCount}</span>
              <button onClick={() => setZoneModal('graveyard')} title="View graveyard"
                className="flex items-center gap-1 px-2 py-1 rounded-lg transition hover:bg-white/10"
                style={{ color: me.graveyard.length > 0 ? '#9ca3af' : '#4b5563' }}>
                🪦 {me.graveyard.length}
              </button>
              <button onClick={() => setZoneModal('exile')} title="View exile"
                className="flex items-center gap-1 px-2 py-1 rounded-lg transition hover:bg-white/10"
                style={{ color: me.exile.length > 0 ? '#a78bfa' : '#4b5563' }}>
                ✦ {me.exile.length}
              </button>
            </div>

            {/* Damage matrix (right) */}
            <div className="ml-auto shrink-0">
              <CmdDamageMatrix players={gameState.players} mySocketId={mySocketId} onUpdate={emit.updateCmdDmg} />
            </div>

            {/* Player name */}
            <div className="flex items-center gap-2 shrink-0"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 12 }}>
              {isMyTurn && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#facc15', boxShadow: '0 0 6px #facc15' }} />}
              <span className="text-sm font-bold" style={{ color: '#f9fafb' }}>{me.playerName}</span>
            </div>
          </div>

          {/* Battlefield + side zones (fills remaining height) */}
          <div className="flex-1 flex gap-2 px-3 py-2 overflow-hidden min-h-0">
            {/* Main battlefield drop zone */}
            <DropZone label="Battlefield" accept={['hand']} isOver={overBf}
              onDragOver={() => setOverBf(true)} onDragLeave={() => setOverBf(false)}
              onDrop={(data) => { setOverBf(false); if (data.source === 'hand') emit.playCard(data.instanceId); }}
              className="flex-1 overflow-hidden">
              <BattlefieldRows
                cards={me.battlefield}
                onTap={emit.tapCard}
                onGraveyard={interceptGraveyard}
                onExile={interceptExile}
                onReturnCommander={emit.returnCmd}
                onDragStart={(e, id) => dragStart(e, id, 'battlefield')}
                onHover={setHoverCard}
                onHoverEnd={() => setHoverCard(null)}
              />
            </DropZone>

            {/* Side: graveyard + exile */}
            <div className="shrink-0 flex flex-col gap-2 justify-center py-1">
              <PileZone cards={me.graveyard} label="Graveyard" isOver={overGy}
                onDragOver={() => setOverGy(true)} onDragLeave={() => setOverGy(false)}
                onDrop={(d) => { setOverGy(false); emit.toGraveyard(d.instanceId); }}
                onHover={setHoverCard} onHoverEnd={() => setHoverCard(null)}
                accentColor="#9ca3af" onClick={() => setZoneModal('graveyard')} />
              <PileZone cards={me.exile} label="Exile" isOver={overEx}
                onDragOver={() => setOverEx(true)} onDragLeave={() => setOverEx(false)}
                onDrop={(d) => { setOverEx(false); emit.toExile(d.instanceId); }}
                onHover={setHoverCard} onHoverEnd={() => setHoverCard(null)}
                accentColor="#a78bfa" onClick={() => setZoneModal('exile')} />
            </div>
          </div>

          {/* Hand */}
          <div className="shrink-0 flex items-end gap-1.5 px-5 pb-2 pt-1 overflow-x-auto"
            style={{ height: 108, borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)' }}>
            {me.hand.length === 0 ? (
              <p className="text-xs italic self-center w-full text-center" style={{ color: 'rgba(255,255,255,0.08)' }}>
                Hand empty — click Draw to draw a card
              </p>
            ) : (
              me.hand.map((card) => (
                <div key={card.instanceId} draggable
                  onDragStart={(e) => dragStart(e, card.instanceId, 'hand')}
                  onClick={() => emit.playCard(card.instanceId)}
                  onMouseEnter={() => setHoverCard(card)}
                  onMouseLeave={() => setHoverCard(null)}
                  className="shrink-0 transition-transform duration-150 origin-bottom"
                  style={{ width: 60, cursor: 'grab' }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-16px) scale(1.08)'; }}
                  onMouseOut={(e)  => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0) scale(1)'; setHoverCard(null); }}
                  title={`${card.name} — drag to battlefield or click to play`}>
                  {card.imageUri
                    ? <img src={card.imageUri} alt={card.name} className="w-full rounded-xl"
                        style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)' }} />
                    : <CardBack style={{ width: 60, height: 84 }} />}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Floating log overlay */}
      {showLog && (
        <div className="fixed right-4 bottom-4 w-72 rounded-xl overflow-hidden z-40"
          style={{ background: 'rgba(0,0,0,0.88)', border: '1px solid rgba(255,255,255,0.08)', maxHeight: 260 }}>
          <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Game Log</span>
            <button onClick={() => setShowLog(false)} style={{ color: '#4b5563' }}>×</button>
          </div>
          <div className="overflow-y-auto p-3 flex flex-col gap-0.5" style={{ maxHeight: 220 }}>
            {gameState.log.map((entry, i) => (
              <p key={i} className="text-xs leading-relaxed" style={{ color: i === 0 ? '#d1d5db' : '#4b5563' }}>{entry}</p>
            ))}
          </div>
        </div>
      )}

      {/* Global hover preview */}
      {hoverCard && <HoverPreview card={hoverCard} x={mouse.x} y={mouse.y} />}

      {/* ── Zone modals ── */}
      {zoneModal === 'graveyard' && (
        <ZoneModal title="Graveyard" cards={me.graveyard} onClose={() => setZoneModal(null)} actions={[
          { label: '↩ Return to Hand',        color: '#86efac', onCard: (c) => emit.toHand(c.instanceId) },
          { label: '⚡ Return to Battlefield', color: '#fbbf24', onCard: (c) => emit.returnToBf(c.instanceId) },
          { label: '⚡ Play from Graveyard',   color: '#fbbf24', onCard: (c) => emit.returnToBf(c.instanceId) },
          { label: '🪄 Cast (Flashback/Unearth)', color: '#c4b5fd', onCard: (c) => emit.returnToBf(c.instanceId) },
          { label: '✦ Exile',                  color: '#a78bfa', onCard: (c) => emit.toExile(c.instanceId) },
        ]} />
      )}
      {zoneModal === 'exile' && (
        <ZoneModal title="Exile" cards={me.exile} onClose={() => setZoneModal(null)} actions={[
          { label: '↩ Return to Hand',       color: '#86efac', onCard: (c) => emit.toHand(c.instanceId) },
          { label: '⚡ Play from Exile',      color: '#fbbf24', onCard: (c) => emit.returnToBf(c.instanceId) },
          { label: '⚡ Return to Battlefield', color: '#fbbf24', onCard: (c) => emit.returnToBf(c.instanceId) },
        ]} />
      )}
      {zoneModal === 'library' && (
        <ZoneModal title="Library Search" cards={libraryCards} loading={libraryLoading}
          onClose={() => setZoneModal(null)} actions={[
            { label: '↩ Tutor to Hand',       color: '#86efac', onCard: (c) => emit.tutor(c.instanceId, 'hand') },
            { label: '⚡ Put on Battlefield',  color: '#fbbf24', onCard: (c) => emit.tutor(c.instanceId, 'battlefield') },
          ]} />
      )}

      {/* ── Commander replacement popup (EDH rule) ── */}
      {commanderPopup && (
        <CommanderReplacementPopup
          cardName={commanderPopup.cardName}
          destination={commanderPopup.destination}
          onCommandZone={() => {
            emit.returnCmd(commanderPopup.instanceId);
            setCommanderPopup(null);
          }}
          onStay={() => {
            if (commanderPopup.destination === 'graveyard') emit.toGraveyard(commanderPopup.instanceId);
            else emit.toExile(commanderPopup.instanceId);
            setCommanderPopup(null);
          }}
        />
      )}
    </div>
  );
}
