import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { useAuth } from '../contexts/AuthContext';
import type { PersonalGameState, PersonalPlayerState, GameCard, TurnPhase } from '../lib/types';

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

function DeathConfirmationPopup({ pending, onConfirm, onCancel }: {
  pending: { socketId: string; playerName: string; reason: string };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="rounded-2xl p-7 max-w-sm w-full mx-4 text-center flex flex-col items-center gap-4"
        style={{ background: '#0c0808', border: '2px solid rgba(239,68,68,0.45)',
          boxShadow: '0 0 60px rgba(239,68,68,0.2), 0 40px 80px rgba(0,0,0,0.95)' }}>
        <span style={{ fontSize: 52 }}>💀</span>
        <div>
          <p className="text-xl font-black" style={{ color: '#fca5a5', lineHeight: 1.3 }}>
            {pending.playerName} has been defeated!
          </p>
          <p className="text-sm mt-2" style={{ color: '#6b7280' }}>{pending.reason}</p>
        </div>
        <div className="flex gap-3 w-full">
          <button onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:brightness-110"
            style={{ background: 'rgba(220,38,38,0.25)', border: '1px solid rgba(220,38,38,0.5)', color: '#fca5a5', cursor: 'pointer' }}>
            Confirm Elimination
          </button>
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', cursor: 'pointer' }}>
            Undo
          </button>
        </div>
      </div>
    </div>
  );
}

function ScryInputPopup({ maxCount, onConfirm, onClose }: {
  maxCount: number; onConfirm: (n: number) => void; onClose: () => void;
}) {
  const [n, setN] = useState(1);
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
      onMouseDown={onClose}>
      <div className="rounded-2xl p-6 flex flex-col gap-4 items-center"
        style={{ background: '#0f172a', border: '1px solid #334155',
          boxShadow: '0 32px 64px rgba(0,0,0,0.95)', width: 280 }}
        onMouseDown={(e) => e.stopPropagation()}>
        <p className="text-base font-bold" style={{ color: '#e2e8f0' }}>Scry how many?</p>
        <input type="number" min={1} max={Math.min(10, maxCount)} value={n}
          onChange={(e) => setN(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
          className="text-center text-2xl font-black rounded-xl focus:outline-none w-24"
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', padding: '8px 0' }} />
        <p className="text-xs" style={{ color: '#475569' }}>1 – {Math.min(10, maxCount)} cards</p>
        <div className="flex gap-3 w-full">
          <button onClick={() => onConfirm(n)}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm transition hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #0369a1, #075985)', color: '#7dd3fc',
              border: '1px solid rgba(125,211,252,0.3)', cursor: 'pointer' }}>
            Scry {n}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#6b7280', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ScryModal({ cards, onResolve, onClose }: {
  cards: GameCard[];
  onResolve: (keepOnTop: string[], putOnBottom: string[]) => void;
  onClose: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, 'top' | 'bottom'>>(() => {
    const d: Record<string, 'top' | 'bottom'> = {};
    cards.forEach((c) => { d[c.instanceId] = 'top'; });
    return d;
  });

  function toggle(id: string) {
    setDecisions((prev) => ({ ...prev, [id]: prev[id] === 'top' ? 'bottom' : 'top' }));
  }

  function handleDone() {
    const keepOnTop = cards.filter((c) => decisions[c.instanceId] === 'top').map((c) => c.instanceId);
    const putOnBottom = cards.filter((c) => decisions[c.instanceId] === 'bottom').map((c) => c.instanceId);
    onResolve(keepOnTop, putOnBottom);
  }

  const topCount = Object.values(decisions).filter((v) => v === 'top').length;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="rounded-2xl flex flex-col"
        style={{ background: '#0f172a', border: '1px solid #334155',
          boxShadow: '0 32px 64px rgba(0,0,0,0.95)', maxWidth: '92vw', maxHeight: '88vh' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px',
          borderBottom: '1px solid #1e293b' }}>
          <div style={{ flex: 1 }}>
            <p className="font-bold" style={{ color: '#7dd3fc', fontSize: 16 }}>
              Scry {cards.length}
            </p>
            <p style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
              {topCount} on top · {cards.length - topCount} on bottom
            </p>
          </div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, background: '#1e293b',
              border: '1px solid #334155', color: '#94a3b8', fontSize: 16,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', gap: 12, padding: '16px 18px', overflowX: 'auto', flexWrap: 'nowrap' }}>
          {cards.map((card) => {
            const isTop = decisions[card.instanceId] === 'top';
            return (
              <div key={card.instanceId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 8, flexShrink: 0, width: 100 }}>
                <div style={{ width: 100, height: 140, borderRadius: 8, overflow: 'hidden',
                  border: isTop ? '2px solid rgba(125,211,252,0.6)' : '2px solid rgba(148,163,184,0.25)',
                  boxShadow: isTop ? '0 0 12px rgba(125,211,252,0.3)' : 'none',
                  opacity: isTop ? 1 : 0.55, transition: 'all 0.15s' }}>
                  {card.imageUri
                    ? <img src={card.imageUri} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', background: '#1e293b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 9, color: '#6b7280', textAlign: 'center', padding: 4 }}>{card.name}</span>
                      </div>}
                </div>
                <p style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', lineHeight: 1.3,
                  maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.name}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                  <button onClick={() => setDecisions((prev) => ({ ...prev, [card.instanceId]: 'top' }))}
                    style={{ padding: '4px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      background: isTop ? 'rgba(125,211,252,0.2)' : 'rgba(255,255,255,0.04)',
                      border: isTop ? '1px solid rgba(125,211,252,0.5)' : '1px solid rgba(255,255,255,0.1)',
                      color: isTop ? '#7dd3fc' : '#4b5563' }}>
                    ▲ Keep on top
                  </button>
                  <button onClick={() => setDecisions((prev) => ({ ...prev, [card.instanceId]: 'bottom' }))}
                    style={{ padding: '4px 0', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      background: !isTop ? 'rgba(148,163,184,0.15)' : 'rgba(255,255,255,0.04)',
                      border: !isTop ? '1px solid rgba(148,163,184,0.4)' : '1px solid rgba(255,255,255,0.1)',
                      color: !isTop ? '#94a3b8' : '#4b5563' }}>
                    ▼ Put on bottom
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={handleDone}
            className="px-6 py-2.5 rounded-xl font-bold text-sm transition hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #0369a1, #075985)', color: '#7dd3fc',
              border: '1px solid rgba(125,211,252,0.3)', cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function MulliganScreen({ hand, mulliganCount, players, mySocketId, onKeep, onMulligan }: {
  hand: GameCard[]; mulliganCount: number;
  players: { socketId: string; playerName: string; mulliganReady: boolean; mulliganCount: number }[];
  mySocketId: string; onKeep: () => void; onMulligan: () => void;
}) {
  const nextDraw = Math.max(0, 6 - mulliganCount);
  const canMulligan = nextDraw >= 0 && mulliganCount < 7;
  const readyCount = players.filter((p) => p.mulliganReady).length;
  const others = players.filter((p) => p.socketId !== mySocketId);
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: 'rgba(5,8,12,0.97)', backdropFilter: 'blur(16px)' }}>
      <div className="text-center">
        <h1 className="text-3xl font-black tracking-tight" style={{ color: '#f1f5f9' }}>Opening Hand</h1>
        {mulliganCount > 0
          ? <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Mulligan {mulliganCount} — drew {hand.length}</p>
          : <p className="text-sm mt-1" style={{ color: '#4b5563' }}>Keep or mulligan to {nextDraw}</p>}
      </div>
      {others.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap justify-center">
          {others.map((p) => (
            <span key={p.socketId} className="text-xs px-3 py-1 rounded-full"
              style={{ background: p.mulliganReady ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${p.mulliganReady ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: p.mulliganReady ? '#4ade80' : '#6b7280' }}>
              {p.mulliganReady ? '✓' : '⏳'} {p.playerName}
              {p.mulliganReady && p.mulliganCount > 0 ? ` (${p.mulliganCount} mull.)` : ''}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-3 flex-wrap justify-center" style={{ maxWidth: 900 }}>
        {hand.map((card) => (
          <div key={card.instanceId} style={{ width: 110, flexShrink: 0 }}>
            {card.imageUri
              ? <img src={card.imageUri} alt={card.name} className="rounded-xl w-full"
                  style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }} />
              : <CardBack style={{ width: 110, height: 154 }} />}
          </div>
        ))}
        {hand.length === 0 && <p style={{ color: '#4b5563', fontSize: 14 }}>Empty hand — you must keep.</p>}
      </div>
      <div className="flex gap-4">
        {canMulligan && (
          <button onClick={onMulligan}
            className="px-7 py-3 rounded-2xl font-bold text-sm transition hover:brightness-110"
            style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)',
              color: '#fbbf24', cursor: 'pointer' }}>
            Mulligan (draw {nextDraw})
          </button>
        )}
        <button onClick={onKeep}
          className="px-7 py-3 rounded-2xl font-bold text-sm transition hover:brightness-110"
          style={{ background: 'linear-gradient(135deg,#065f46,#047857)',
            border: '1px solid rgba(52,211,153,0.4)', color: '#34d399', cursor: 'pointer' }}>
          Keep Hand{mulliganCount > 0 ? ' + Scry 1' : ''}
        </button>
      </div>
      {readyCount > 0 && (
        <p style={{ fontSize: 12, color: '#374151' }}>{readyCount}/{players.length} players ready</p>
      )}
    </div>
  );
}

function ConcedePopup({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
      onMouseDown={onCancel}>
      <div className="rounded-2xl p-7 max-w-sm w-full mx-4 text-center flex flex-col items-center gap-5"
        style={{ background: '#0f172a', border: '1px solid #334155', boxShadow: '0 32px 64px rgba(0,0,0,0.95)' }}
        onMouseDown={(e) => e.stopPropagation()}>
        <p className="text-lg font-bold" style={{ color: '#f1f5f9' }}>Concede the game?</p>
        <p className="text-sm" style={{ color: '#6b7280' }}>This cannot be undone.</p>
        <div className="flex gap-3 w-full">
          <button onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-bold text-sm transition hover:brightness-110"
            style={{ background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.4)', color: '#fca5a5', cursor: 'pointer' }}>
            Concede
          </button>
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MillInputPopup({ maxCount, onConfirm, onClose }: {
  maxCount: number; onConfirm: (n: number) => void; onClose: () => void;
}) {
  const [n, setN] = useState(1);
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
      onMouseDown={onClose}>
      <div className="rounded-2xl p-6 flex flex-col gap-4 items-center"
        style={{ background: '#0f172a', border: '1px solid #334155',
          boxShadow: '0 32px 64px rgba(0,0,0,0.95)', width: 280 }}
        onMouseDown={(e) => e.stopPropagation()}>
        <p className="text-base font-bold" style={{ color: '#e2e8f0' }}>Mill how many cards?</p>
        <input type="number" min={1} max={maxCount} value={n}
          onChange={(e) => setN(Math.min(maxCount, Math.max(1, parseInt(e.target.value) || 1)))}
          className="text-center text-2xl font-black rounded-xl focus:outline-none w-24"
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', padding: '8px 0' }} />
        <p className="text-xs" style={{ color: '#475569' }}>1 – {maxCount} cards</p>
        <div className="flex gap-3 w-full">
          <button onClick={() => onConfirm(n)}
            className="flex-1 py-2.5 rounded-xl font-bold text-sm transition hover:brightness-110"
            style={{ background: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.4)', color: '#94a3b8', cursor: 'pointer' }}>
            Mill {n}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MillResultModal({ cards, onClose }: { cards: GameCard[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="rounded-2xl flex flex-col"
        style={{ background: '#0f172a', border: '1px solid #334155',
          boxShadow: '0 32px 64px rgba(0,0,0,0.95)', maxWidth: '92vw', maxHeight: '88vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #1e293b' }}>
          <p className="font-bold flex-1" style={{ color: '#94a3b8', fontSize: 16 }}>
            Milled {cards.length} card{cards.length !== 1 ? 's' : ''}
          </p>
          <button onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, background: '#1e293b', border: '1px solid #334155',
              color: '#94a3b8', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '16px 18px', overflowX: 'auto', flexWrap: 'nowrap' }}>
          {cards.map((card) => (
            <div key={card.instanceId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 6, flexShrink: 0, width: 100 }}>
              <div style={{ width: 100, height: 140, borderRadius: 8, overflow: 'hidden',
                border: '1px solid rgba(148,163,184,0.25)' }}>
                {card.imageUri
                  ? <img src={card.imageUri} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', background: '#1e293b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, color: '#6b7280', textAlign: 'center', padding: 4 }}>{card.name}</span>
                    </div>}
              </div>
              <p style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', maxWidth: 96,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</p>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-sm"
            style={{ background: 'rgba(148,163,184,0.12)', border: '1px solid rgba(148,163,184,0.3)', color: '#94a3b8', cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Battlefield row organisation ──────────────────────────────────────────────

const TYPE_ROWS: { label: string; match: (t: string) => boolean; isLand?: boolean }[] = [
  { label: 'Creatures',     match: (t) => t.includes('Creature') },
  { label: 'Artifacts',     match: (t) => !t.includes('Creature') && t.includes('Artifact') },
  { label: 'Enchantments',  match: (t) => !t.includes('Creature') && !t.includes('Artifact') && t.includes('Enchantment') },
  { label: 'Planeswalkers', match: (t) => t.includes('Planeswalker') && !t.includes('Creature') },
  { label: 'Lands',         match: (t) => t.includes('Land'), isLand: true },
  { label: 'Other',         match: (_) => true },
];

// Opponent board: Lands at top (farthest from center) → Creatures at bottom (closest to center),
// mirroring the player's layout so the two creature rows face each other across the table.
// Other MUST remain last so it doesn't swallow all cards before type-specific rows can match.
const TYPE_ROWS_OPP: typeof TYPE_ROWS = [
  { label: 'Lands',         match: (t) => t.includes('Land'), isLand: true },
  { label: 'Planeswalkers', match: (t) => t.includes('Planeswalker') && !t.includes('Creature') },
  { label: 'Enchantments',  match: (t) => !t.includes('Creature') && !t.includes('Artifact') && t.includes('Enchantment') },
  { label: 'Artifacts',     match: (t) => !t.includes('Creature') && t.includes('Artifact') },
  { label: 'Creatures',     match: (t) => t.includes('Creature') },
  { label: 'Other',         match: (_) => true },
];

function groupByType(
  cards: GameCard[],
  rowDefs: typeof TYPE_ROWS = TYPE_ROWS,
): { label: string; cards: GameCard[]; isLand: boolean }[] {
  const assigned = new Set<string>();
  const rows: { label: string; cards: GameCard[]; isLand: boolean }[] = [];
  for (const { label, match, isLand = false } of rowDefs) {
    const rowCards = cards.filter((c) => !assigned.has(c.instanceId) && match(c.typeLine));
    rowCards.forEach((c) => assigned.add(c.instanceId));
    if (rowCards.length > 0) rows.push({ label, cards: rowCards, isLand });
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

// ── Counter system ────────────────────────────────────────────────────────────

const COUNTER_TYPES = ['+1/+1', '-1/-1', 'loyalty', 'charge', 'time', 'poison'] as const;

const COUNTER_META: Record<string, { sym: string; label: string; color: string; bg: string }> = {
  '+1/+1':   { sym: '+1/+1', label: '+1/+1',  color: '#4ade80', bg: '#166534' },
  '-1/-1':   { sym: '-1/-1', label: '-1/-1',  color: '#f87171', bg: '#7f1d1d' },
  'loyalty': { sym: '⚜',    label: 'Loyalty', color: '#fbbf24', bg: '#78350f' },
  'charge':  { sym: '⚡',   label: 'Charge',  color: '#93c5fd', bg: '#1e3a8a' },
  'time':    { sym: '⏳',   label: 'Time',    color: '#e2e8f0', bg: '#334155' },
  'poison':  { sym: '☠',   label: 'Poison',  color: '#d8b4fe', bg: '#4c1d95' },
};

function CounterBadge({ type, count }: { type: string; count: number }) {
  const m = COUNTER_META[type] ?? { sym: type.slice(0, 4), color: '#e2e8f0', bg: '#374151' };
  return (
    <div style={{ background: m.bg, color: m.color, borderRadius: 4, padding: '1px 4px',
      fontSize: 9, fontWeight: 800, lineHeight: 1.3,
      border: '1px solid rgba(255,255,255,0.18)', whiteSpace: 'nowrap' }}>
      {count > 1 && <span style={{ marginRight: 1 }}>{count}×</span>}
      {m.sym}
    </div>
  );
}

// ── P/T bar ───────────────────────────────────────────────────────────────────

function PtBar({ card }: { card: GameCard }) {
  const isCreature = (card.typeLine ?? '').includes('Creature');
  if (!isCreature) return null;
  const basePow = card.powerOverride ?? card.power ?? null;
  const baseTou = card.toughnessOverride ?? card.toughness ?? null;
  if (basePow === null && baseTou === null) return null;
  const pp = card.counters?.['+1/+1'] ?? 0;
  const mm = card.counters?.['-1/-1'] ?? 0;
  const delta = pp - mm;
  const fmt = (base: string | null) => {
    if (base === null) return '?';
    const n = parseInt(base, 10);
    return isNaN(n) ? base : String(Math.max(0, n + delta));
  };
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 17,
      background: 'rgba(0,0,0,0.86)', borderRadius: '0 0 6px 6px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 2, zIndex: 20, pointerEvents: 'none',
      fontSize: 10, fontWeight: 800, color: '#f1f5f9',
    }}>
      <span style={{ fontSize: 8, lineHeight: 1 }}>⚔</span>
      <span>{fmt(basePow)}</span>
      <span style={{ opacity: 0.35, fontSize: 9 }}>/</span>
      <span style={{ fontSize: 8, lineHeight: 1 }}>🛡</span>
      <span>{fmt(baseTou)}</span>
    </div>
  );
}

// ── My battlefield card ───────────────────────────────────────────────────────

function MyBattlefieldCard({ card, onTap, onGraveyard, onExile, onReturnCommander, onReturnHand,
  onGiveControl, opponents, onDragStart, onHover, onHoverEnd, onUpdateCounter, onSetPt, onSetKeywords,
  cardW = 140, cardH = 196,
}: {
  card: GameCard; onTap: () => void; onGraveyard: () => void; onExile: () => void;
  onReturnCommander: () => void; onReturnHand: () => void;
  onGiveControl: (targetSocketId: string) => void;
  opponents: { socketId: string; playerName: string }[];
  onDragStart: (e: React.DragEvent) => void;
  onHover: (c: GameCard) => void; onHoverEnd: () => void;
  onUpdateCounter: (counter: string, delta: number) => void;
  onSetPt: (power: string, toughness: string) => void;
  onSetKeywords: (keywords: string[]) => void;
  cardW?: number; cardH?: number;
}) {
  const [menuMode, setMenuMode] = useState<null | 'main' | 'giveControl'>(null);

  useEffect(() => {
    if (!menuMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuMode(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuMode]);

  const counters = card.counters ?? {};
  const hasCounters = Object.values(counters).some((n) => n > 0);

  function openMenu() { setMenuMode('main'); onHoverEnd(); }
  function closeMenu() { setMenuMode(null); }

  return (
    <TappedCardWrapper card={card} cardW={cardW} cardH={cardH} className="group">
      {/* Card face */}
      <div draggable
        onDragStart={(e) => { onDragStart(e); closeMenu(); }}
        onClick={onTap}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openMenu(); }}
        onMouseEnter={() => { if (!menuMode) onHover(card); }} onMouseLeave={() => onHoverEnd()}
        className="w-full h-full" style={{ cursor: card.tapped ? 'pointer' : 'grab' }}>
        {card.faceDown ? (
          <div className="w-full h-full rounded-lg flex flex-col items-center justify-center gap-1"
            style={{ background: 'linear-gradient(135deg, #1e1b4b, #0f172a)',
              border: card.tapped ? '1.5px solid rgba(250,204,21,0.45)' : '1.5px solid rgba(99,102,241,0.4)',
              boxShadow: card.tapped ? '0 0 10px rgba(250,204,21,0.3)' : '0 4px 10px rgba(0,0,0,0.6)' }}>
            <span style={{ fontSize: 22, opacity: 0.3 }}>🂠</span>
            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.22)', fontWeight: 700, letterSpacing: 1 }}>FACE DOWN</span>
          </div>
        ) : card.imageUri ? (
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

      {/* Keyword badges — top-left */}
      {(card.keywords ?? []).length > 0 && (
        <div style={{ position: 'absolute', top: 3, left: 3, display: 'flex', flexWrap: 'wrap',
          gap: 2, zIndex: 15, pointerEvents: 'none', maxWidth: '90%' }}>
          {(card.keywords ?? []).map((kw) => (
            <span key={kw} style={{
              background: `${KEYWORD_COLOR[kw] ?? '#64748b'}33`,
              border: `1px solid ${KEYWORD_COLOR[kw] ?? '#64748b'}88`,
              color: KEYWORD_COLOR[kw] ?? '#e2e8f0',
              borderRadius: 3, padding: '1px 3px', fontSize: 8, fontWeight: 800, letterSpacing: 0.4,
            }}>{KEYWORD_ABBR[kw] ?? kw.slice(0, 3).toUpperCase()}</span>
          ))}
        </div>
      )}

      {/* Counter badges — bottom-left */}
      {hasCounters && (
        <div style={{ position: 'absolute', bottom: 4, left: 3, display: 'flex', flexWrap: 'wrap',
          gap: 2, zIndex: 15, pointerEvents: 'none', maxWidth: '70%' }}>
          {Object.entries(counters).filter(([, n]) => n > 0).map(([type, n]) => (
            <CounterBadge key={type} type={type} count={n} />
          ))}
        </div>
      )}

      {/* P/T bar */}
      <PtBar card={card} />

      {/* ⋮ button */}
      <button
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition z-20"
        style={{ background: '#374151', border: '1px solid #4b5563', color: '#d1d5db' }}
        onClick={(e) => { e.stopPropagation(); openMenu(); }}>⋮</button>

      {/* Card action modal — portaled to document.body */}
      {menuMode !== null && ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={closeMenu}>
          <div className="rounded-2xl"
            style={{ width: 320, maxHeight: '80vh', overflowY: 'auto',
              background: '#0f172a', border: '1px solid #334155',
              boxShadow: '0 32px 64px rgba(0,0,0,0.95)', zIndex: 9999 }}
            onMouseDown={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 12px 14px 18px',
              borderBottom: '1px solid #1e293b' }}>
              {menuMode === 'giveControl' && (
                <button onClick={() => setMenuMode('main')}
                  style={{ marginRight: 8, width: 28, height: 28, borderRadius: 7, background: '#1e293b',
                    border: '1px solid #334155', color: '#94a3b8', fontSize: 14,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
              )}
              <span style={{ fontSize: 16, color: '#f1f5f9', fontWeight: 700, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {menuMode === 'giveControl' ? 'Give Control To…' : card.name.split(',')[0]}
              </span>
              <button onClick={closeMenu}
                style={{ width: 30, height: 30, borderRadius: 8, background: '#1e293b',
                  border: '1px solid #334155', color: '#94a3b8', fontSize: 16,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {menuMode === 'giveControl' ? (
              /* Give Control player list */
              <div style={{ padding: '6px 0' }}>
                {opponents.length === 0 ? (
                  <p style={{ padding: '12px 18px', fontSize: 13, color: '#64748b' }}>No other players in game.</p>
                ) : opponents.map((opp) => (
                  <button key={opp.socketId}
                    onClick={() => { onGiveControl(opp.socketId); closeMenu(); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 18px', fontSize: 14, fontWeight: 500,
                      color: '#fbbf24', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                    {opp.playerName}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {/* Actions */}
                <div style={{ padding: '6px 0', borderBottom: '1px solid #1e293b' }}>
                  {([
                    { label: card.tapped ? '↺ Untap' : '↻ Tap',  action: () => { onTap(); closeMenu(); },            color: '#f1f5f9' },
                    { label: '→ Send to Graveyard',                action: () => { onGraveyard(); closeMenu(); },       color: '#94a3b8' },
                    { label: '→ Send to Exile',                    action: () => { onExile(); closeMenu(); },           color: '#c4b5fd' },
                    { label: '↩ Return to Hand',                   action: () => { onReturnHand(); closeMenu(); },      color: '#86efac' },
                    ...(card.isCommander ? [{ label: '⚜ Return to Command Zone', action: () => { onReturnCommander(); closeMenu(); }, color: '#fbbf24' }] : []),
                    ...(opponents.length > 0 ? [{ label: '↗ Give Control →', action: () => setMenuMode('giveControl'), color: '#fb923c' }] : []),
                  ] as { label: string; action: () => void; color: string }[]).map(({ label, action, color }) => (
                    <button key={label} onClick={action}
                      style={{ display: 'block', width: '100%', textAlign: 'left',
                        padding: '10px 18px', fontSize: 14, fontWeight: 500,
                        color, background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Counters */}
                <div style={{ padding: '6px 0' }}>
                  <p style={{ fontSize: 11, color: '#64748b', padding: '6px 18px 6px',
                    fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Counters</p>
                  {COUNTER_TYPES.map((type) => {
                    const m = COUNTER_META[type];
                    const n = counters[type] ?? 0;
                    const btnStyle: React.CSSProperties = {
                      width: 28, height: 28, borderRadius: 7, background: '#1e293b',
                      border: '1px solid #334155', color: '#cbd5e1', fontSize: 18,
                      lineHeight: 1, cursor: 'pointer', flexShrink: 0, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    };
                    return (
                      <div key={type} style={{ display: 'flex', alignItems: 'center',
                        padding: '5px 12px 5px 18px', gap: 10 }}>
                        <span style={{ fontSize: 14, color: m.color, fontWeight: 700, flex: 1 }}>
                          {m.label}
                        </span>
                        <button onClick={() => onUpdateCounter(type, -1)} style={btnStyle}>−</button>
                        <span style={{ fontSize: 15, fontWeight: 800,
                          color: n > 0 ? m.color : '#475569', minWidth: 26, textAlign: 'center' }}>{n}</span>
                        <button onClick={() => onUpdateCounter(type, 1)} style={btnStyle}>+</button>
                      </div>
                    );
                  })}
                  {hasCounters && (
                    <button onClick={() => { Object.keys(counters).forEach((t) => onUpdateCounter(t, -(counters[t] ?? 0))); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 18px', fontSize: 13, color: '#f87171',
                        background: 'none', border: 'none', cursor: 'pointer', marginTop: 2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      × Clear all counters
                    </button>
                  )}
                </div>

                {/* Keywords */}
                <div style={{ padding: '6px 0', borderTop: '1px solid #1e293b' }}>
                  <p style={{ fontSize: 11, color: '#64748b', padding: '6px 18px 8px',
                    fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>Keywords</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 18px 8px' }}>
                    {KEYWORD_LIST.map((kw) => {
                      const active = (card.keywords ?? []).includes(kw);
                      return (
                        <button key={kw}
                          onClick={() => {
                            const current = card.keywords ?? [];
                            const next = active ? current.filter((k) => k !== kw) : [...current, kw];
                            onSetKeywords(next);
                          }}
                          style={{
                            padding: '3px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            background: active ? `${KEYWORD_COLOR[kw]}33` : 'rgba(255,255,255,0.04)',
                            border: active ? `1px solid ${KEYWORD_COLOR[kw]}88` : '1px solid rgba(255,255,255,0.1)',
                            color: active ? KEYWORD_COLOR[kw] : '#475569',
                          }}>
                          {KEYWORD_ABBR[kw]} <span style={{ opacity: 0.6, fontSize: 9 }}>{kw}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </TappedCardWrapper>
  );
}

// ── Canvas layout helpers ─────────────────────────────────────────────────────

const C_W_BASE = 140, C_H_BASE = 196;   // hardcoded 140×196 — no dynamic scaling
const C_LW_BASE = 112, C_LH_BASE = 157; // lands slightly smaller
const C_HGAP = 4, C_RGAP = 16;
const C_LBLW = 80;

function cardSizeForZone(_groupCount: number, isLand: boolean, _zoneW: number): { cW: number; cH: number } {
  return isLand ? { cW: C_LW_BASE, cH: C_LH_BASE } : { cW: C_W_BASE, cH: C_H_BASE };
}

// Zone colors: [me, op1, op2, op3]
const ZONE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a855f7'];

const CANVAS_W = 3200;
const CANVAS_H = 2000;
const OPP_INFO_H = 72;  // opponent info header height
const MY_LABEL_H = 32;  // my zone top label height

// Keyword abbreviation map
const KEYWORD_ABBR: Record<string, string> = {
  Trample: 'TRM', Hexproof: 'HEX', Haste: 'HST', Flying: 'FLY', Vigilance: 'VIG',
  Lifelink: 'LNK', Deathtouch: 'DTH', 'First Strike': 'FST', 'Double Strike': 'DBL',
  Indestructible: 'IND', Reach: 'RCH', Menace: 'MNC', Flash: 'FLH',
};
const KEYWORD_LIST = Object.keys(KEYWORD_ABBR);
const KEYWORD_COLOR: Record<string, string> = {
  Trample: '#f97316', Hexproof: '#22c55e', Haste: '#ef4444', Flying: '#60a5fa',
  Vigilance: '#a78bfa', Lifelink: '#f472b6', Deathtouch: '#6b7280',
  'First Strike': '#fbbf24', 'Double Strike': '#fb923c', Indestructible: '#d1d5db',
  Reach: '#4ade80', Menace: '#c084fc', Flash: '#34d399',
};

interface CRow {
  label: string; isLand: boolean;
  y: number; cW: number; cH: number;
  slots: { id: string; groupSize: number; groupIndex: number; x: number }[];
}

const FAN_GAP = 22; // px gap between fanned same-name cards

function buildCRows(cards: GameCard[], rowDefs: typeof TYPE_ROWS = TYPE_ROWS, zoneW = CANVAS_W - 40): CRow[] {
  const out: CRow[] = [];
  let ry = 0;
  for (const { label, cards: rc, isLand } of groupByType(cards, rowDefs)) {
    const nameMap = new Map<string, GameCard[]>();
    for (const c of rc) {
      const arr = nameMap.get(c.name) ?? [];
      arr.push(c);
      nameMap.set(c.name, arr);
    }
    const groupCount = nameMap.size;
    const { cW, cH } = cardSizeForZone(groupCount, isLand, zoneW);
    const slots: CRow['slots'] = [];
    let x = C_LBLW;
    for (const [, group] of nameMap) {
      for (let gi = 0; gi < group.length; gi++) {
        slots.push({ id: group[gi].instanceId, groupSize: group.length, groupIndex: gi, x: x + gi * FAN_GAP });
      }
      x += cW + C_HGAP;
    }
    out.push({ label, isLand, y: ry, cW, cH, slots });
    ry += cH + C_RGAP;
  }
  return out;
}

interface ZoneRect { x: number; y: number; w: number; h: number }

function tableLayout(opCount: number): { my: ZoneRect; ops: ZoneRect[] } {
  const PW = CANVAS_W - 40;
  const GAP = 60;

  if (opCount === 0) {
    return { my: { x: 20, y: 20, w: PW, h: CANVAS_H - 40 }, ops: [] };
  }
  if (opCount === 1) {
    const h = Math.floor((CANVAS_H - 40 - GAP) / 2);
    return {
      my:  { x: 20, y: 20 + h + GAP, w: PW, h },
      ops: [{ x: 20, y: 20, w: PW, h }],
    };
  }
  if (opCount === 2) {
    const h = Math.floor((CANVAS_H - 40 - GAP) / 2);
    const hw = Math.floor((PW - 20) / 2);
    return {
      my:  { x: 20, y: 20 + h + GAP, w: PW, h },
      ops: [
        { x: 20,          y: 20, w: hw, h },
        { x: 20 + hw + 20, y: 20, w: hw, h },
      ],
    };
  }
  // 3 opponents: 4-player quadrant layout
  // Me=bottom-left  Op0=bottom-right  Op1=top-left  Op2=top-right
  const hw = Math.floor((PW - 20) / 2);
  const hh = Math.floor((CANVAS_H - 40 - GAP) / 2);
  return {
    my:  { x: 20,        y: 20 + hh + GAP, w: hw, h: hh },
    ops: [
      { x: 20 + hw + 20, y: 20 + hh + GAP, w: hw, h: hh }, // bottom-right
      { x: 20,           y: 20,             w: hw, h: hh }, // top-left
      { x: 20 + hw + 20, y: 20,             w: hw, h: hh }, // top-right
    ],
  };
}

// ── Mini pile (opponent graveyard / exile) ────────────────────────────────────

function MiniPile({ cards, label, color, onHover, onHoverEnd }: {
  cards: GameCard[]; label: string; color: string;
  onHover: (c: GameCard) => void; onHoverEnd: () => void;
}) {
  const top = cards[cards.length - 1];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1 }}>{label}</span>
      <div style={{ position: 'relative', width: 48, height: 68, borderRadius: 6, overflow: 'hidden',
        border: `1px dashed ${color}70`, background: 'rgba(0,0,0,0.35)' }}
        onMouseEnter={() => top && onHover(top)} onMouseLeave={onHoverEnd}>
        {top?.imageUri && <img src={top.imageUri} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }} />}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
          textAlign: 'center', background: 'rgba(0,0,0,0.7)', padding: '1px 0' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color }}>{cards.length}</span>
        </div>
      </div>
    </div>
  );
}

// ── Canvas pile zone (my graveyard / exile on the canvas) ─────────────────────

function CanvasPileZone({ cards, icon, label, color, bgColor, isOver,
  onDragOver, onDragLeave, onDrop, onClick, onHover, onHoverEnd,
}: {
  cards: GameCard[]; icon: string; label: string;
  color: string; bgColor: string; isOver: boolean;
  onDragOver: () => void; onDragLeave: () => void;
  onDrop: (d: DragData) => void; onClick: () => void;
  onHover: (c: GameCard) => void; onHoverEnd: () => void;
}) {
  const topCard = cards[cards.length - 1];
  return (
    <div style={{
      position: 'relative', width: 130, height: 182, borderRadius: 12, overflow: 'hidden',
      border: isOver ? `2px solid ${color}` : `2px dashed ${color}55`,
      background: isOver ? `${bgColor}35` : `${bgColor}18`,
      cursor: 'pointer', transition: 'border-color 0.12s, background 0.12s',
      boxShadow: isOver ? `0 0 24px ${color}50` : 'none',
    }}
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver(); }}
      onDragLeave={(e) => { e.stopPropagation(); onDragLeave(); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation();
        try { onDrop(JSON.parse(e.dataTransfer.getData('application/json'))); } catch { /* */ }
      }}
      onMouseDown={(e) => e.stopPropagation()}>

      {/* Top card art */}
      {topCard?.imageUri && (
        <img src={topCard.imageUri}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
          onMouseEnter={() => onHover(topCard)} onMouseLeave={onHoverEnd} />
      )}

      {/* Scrim so label is always readable */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 30%, rgba(0,0,0,0.1) 100%)' }} />

      {/* Icon + label */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4, pointerEvents: 'none' }}>
        {!topCard && <span style={{ fontSize: 32, opacity: 0.45 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: `${color}dd`,
          textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          {label.toUpperCase()}
        </span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }}>
          drag cards here
        </span>
      </div>

      {/* Card count badge */}
      <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.88)',
        borderRadius: 6, padding: '2px 7px', border: `1px solid ${color}70` }}>
        <span style={{ fontSize: 13, fontWeight: 900, color, fontFamily: 'monospace' }}>{cards.length}</span>
      </div>
    </div>
  );
}

// ── Opponent zone header (rendered inside canvas) ─────────────────────────────

function ZoneHeader({ player, color, isMonarch }: { player: PersonalPlayerState; color: string; isMonarch: boolean }) {
  const life = player.life;
  const lifeColor = life <= 0 ? '#ef4444' : life <= 10 ? '#fb923c' : '#f1f5f9';
  const commander = player.commandZone[0];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: OPP_INFO_H,
      background: 'rgba(0,0,0,0.72)', borderRadius: '12px 12px 0 0',
      borderBottom: `1px solid ${color}50`,
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
      zIndex: 2 }}>
      {player.isActive && (
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#facc15',
          boxShadow: '0 0 8px #facc15', flexShrink: 0, display: 'inline-block' }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isMonarch && <span style={{ fontSize: 14, lineHeight: 1 }} title="Monarch">👑</span>}
          <span style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', lineHeight: 1.1 }}>{player.playerName}</span>
        </div>
        {commander && (
          <span style={{ fontSize: 11, color: '#fbbf24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ⚜ {commander.name.split(',')[0]}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#94a3b8', flexShrink: 0, fontWeight: 600 }}>
        <span title="Hand">✋ {player.handCount}</span>
        <span title="Library">📚 {player.libraryCount}</span>
        {player.poisonCounters > 0 && (
          <span title="Poison" style={{ color: '#a3e635' }}>☠️ {player.poisonCounters}</span>
        )}
      </div>
      <span style={{ fontSize: 34, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1,
        color: lifeColor, flexShrink: 0,
        textShadow: life <= 10 ? `0 0 14px ${lifeColor}` : '0 2px 4px rgba(0,0,0,0.8)' }}>
        {life}
      </span>
    </div>
  );
}

// ── Shared table canvas ───────────────────────────────────────────────────────

interface TableCanvasProps {
  me: PersonalPlayerState;
  opponents: PersonalPlayerState[];
  isDefendingPhase: boolean;
  onTapCard: (id: string) => void;
  onGraveyardCard: (id: string) => void;
  onExileCard: (id: string) => void;
  onReturnCmdCard: (id: string) => void;
  onReturnHandCard: (id: string) => void;
  onGiveControl: (instanceId: string, targetSocketId: string) => void;
  onDragStartCard: (e: React.DragEvent, id: string) => void;
  onPlayCard: (id: string) => void;
  onHover: (c: GameCard) => void;
  onHoverEnd: () => void;
  onBfCardHover: (id: string | null) => void;
  onUpdateCounter: (instanceId: string, counter: string, delta: number) => void;
  onSetPt: (instanceId: string, power: string, toughness: string) => void;
  onSetKeywords: (instanceId: string, keywords: string[]) => void;
  onDropToGy: (d: DragData) => void;
  onDropToEx: (d: DragData) => void;
  onOpenGy: () => void;
  onOpenEx: () => void;
  gyCards: GameCard[];
  exCards: GameCard[];
  monarchSocketId: string | null;
}

function TableCanvas({
  me, opponents, isDefendingPhase,
  onTapCard, onGraveyardCard, onExileCard, onReturnCmdCard, onReturnHandCard, onGiveControl, onDragStartCard,
  onPlayCard, onHover, onHoverEnd, onBfCardHover, onUpdateCounter, onSetPt, onSetKeywords,
  onDropToGy, onDropToEx, onOpenGy, onOpenEx, gyCards, exCards, monarchSocketId,
}: TableCanvasProps) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.72);
  const [overBf, setOverBf] = useState(false);
  const [overGy, setOverGy] = useState(false);
  const [overEx, setOverEx] = useState(false);
  const [blockerCards, setBlockerCards] = useState<GameCard[]>([]);
  const [overBlockers, setOverBlockers] = useState(false);
  const [blockersDeclared, setBlockersDeclared] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const cur = useRef({ pan: { x: 0, y: 0 }, zoom: 0.72 });
  cur.current = { pan, zoom };

  const activeOpponents = opponents.filter((p) => !p.eliminated);
  const layout = tableLayout(activeOpponents.length);
  const myColor = ZONE_COLORS[0];

  function fitTable() {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nz = Math.max(0.25, Math.min(1.5,
      Math.min((rect.width - 32) / CANVAS_W, (rect.height - 32) / CANVAS_H)
    ));
    setPan({ x: (rect.width - CANVAS_W * nz) / 2, y: (rect.height - CANVAS_H * nz) / 2 });
    setZoom(nz);
  }

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const lay = tableLayout(activeOpponents.length);
    const z = 0.72;
    const zx = lay.my.x + lay.my.w / 2;
    const zy = lay.my.y + lay.my.h / 2;
    setPan({ x: rect.width / 2 - zx * z, y: rect.height / 2 - zy * z });
    // zoom stays at its initial value — no auto-fit
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isDefendingPhase) {
      setBlockerCards([]);
      setBlockersDeclared(false);
    }
  }, [isDefendingPhase]);

  // Attach non-passive wheel listener so we can preventDefault
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
      const { zoom: z, pan: p } = cur.current;
      const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.008) : (e.deltaY < 0 ? 1.1 : 1 / 1.1);
      const nz = Math.max(0.25, Math.min(1.5, z * factor));
      const s = nz / z;
      setZoom(nz);
      setPan({ x: ox - s * (ox - p.x), y: oy - s * (oy - p.y) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onBgDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const p0 = { ...cur.current.pan };
    const m0 = { x: e.clientX, y: e.clientY };
    if (viewportRef.current) viewportRef.current.style.cursor = 'grabbing';
    const mv = (ev: MouseEvent) => setPan({ x: p0.x + ev.clientX - m0.x, y: p0.y + ev.clientY - m0.y });
    const up = () => {
      if (viewportRef.current) viewportRef.current.style.cursor = 'grab';
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  }

  const blockerIdSet = new Set(blockerCards.map(c => c.instanceId));
  const BLOCK_ZONE_H = C_H_BASE + 44;
  const rowBaseY = MY_LABEL_H + (isDefendingPhase ? BLOCK_ZONE_H + 8 : 0);
  const battlefieldMinusBlockers = me.battlefield.filter(c => !blockerIdSet.has(c.instanceId));
  const myRows = buildCRows(battlefieldMinusBlockers, TYPE_ROWS, layout.my.w);
  const myCardMap = new Map<string, GameCard>(me.battlefield.map(c => [c.instanceId as string, c as GameCard]));

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden"
      style={{ cursor: 'grab' }}
      onMouseDown={onBgDown}>

      {/* ── Transformed table canvas ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
        width: CANVAS_W, height: CANVAS_H,
      }}>

        {/* Opponent zones */}
        {activeOpponents.map((player, i) => {
          const zone = layout.ops[i];
          if (!zone) return null;
          const color = ZONE_COLORS[(i + 1) % ZONE_COLORS.length];
          // Zones above my zone (y < layout.my.y) are "top" zones — use mirrored row order
          const rows = buildCRows(player.battlefield, TYPE_ROWS_OPP, zone.w);
          const cardMap = new Map<string, GameCard>(player.battlefield.map(c => [c.instanceId as string, c as GameCard]));

          return (
            <div key={player.socketId} style={{
              position: 'absolute', left: zone.x, top: zone.y, width: zone.w, height: zone.h,
              borderRadius: 14,
              border: player.eliminated ? '2px solid rgba(75,85,99,0.4)' : player.isActive ? `2px solid ${color}cc` : `2px solid ${color}55`,
              background: player.eliminated ? 'rgba(17,17,17,0.6)' : player.isActive ? `${color}18` : `${color}0e`,
              boxShadow: player.eliminated ? 'none' : player.isActive ? `0 0 50px ${color}28, inset 0 0 30px ${color}08` : `inset 0 0 20px ${color}06`,
              opacity: player.eliminated ? 0.45 : 1,
              transition: 'opacity 0.4s, border-color 0.4s',
            }}>
              <ZoneHeader player={player} color={color} isMonarch={player.socketId === monarchSocketId} />

              {/* Eliminated overlay */}
              {player.eliminated && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 10, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 3,
                    color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase' }}>Eliminated</span>
                </div>
              )}

              {/* Card rows */}
              {rows.map(row => (
                <React.Fragment key={row.label}>
                  <div style={{ position: 'absolute', left: 0, top: OPP_INFO_H + row.y + row.cH / 2 - 8,
                    width: C_LBLW - 4, textAlign: 'right', pointerEvents: 'none' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                      color: row.isLand ? 'rgba(134,239,172,0.7)' : 'rgba(255,255,255,0.55)' }}>
                      {row.label.split('/')[0].toUpperCase()}
                    </span>
                  </div>
                  {row.slots.map(slot => {
                    const card = cardMap.get(slot.id);
                    if (!card) return null;
                    const showBadge = slot.groupSize > 1 && slot.groupIndex === slot.groupSize - 1;
                    const oppCounters = card.counters ?? {};
                    const oppHasCounters = Object.values(oppCounters).some((n) => n > 0);
                    const oppKeywords = card.keywords ?? [];
                    return (
                      <div key={slot.id} style={{
                        position: 'absolute', left: slot.x, top: OPP_INFO_H + row.y,
                        zIndex: 2 + slot.groupIndex,
                      }}
                        onMouseDown={e => e.stopPropagation()}>
                        <TappedCardWrapper card={card} cardW={row.cW} cardH={row.cH}>
                          <div onMouseEnter={() => onHover(card)} onMouseLeave={onHoverEnd}
                            className="w-full h-full cursor-default">
                            {card.faceDown ? (
                              <div className="w-full h-full rounded flex flex-col items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, #1e1b4b, #0f172a)',
                                  border: '1px solid rgba(99,102,241,0.35)' }}>
                                <span style={{ fontSize: 12, opacity: 0.28 }}>🂠</span>
                              </div>
                            ) : card.imageUri ? (
                              <img src={card.imageUri} className="w-full h-full object-cover rounded"
                                style={{ opacity: card.tapped ? 0.72 : 1,
                                  border: card.tapped ? '1px solid rgba(250,204,21,0.4)' : '1px solid rgba(255,255,255,0.08)' }} />
                            ) : (
                              <div className="w-full h-full rounded flex items-center justify-center p-0.5"
                                style={{ background: '#1f2937', border: '1px solid #374151' }}>
                                <span style={{ fontSize: 6, color: '#6b7280' }}>{card.name.slice(0, 8)}</span>
                              </div>
                            )}
                          </div>
                        </TappedCardWrapper>
                        {/* Keyword badges */}
                        {oppKeywords.length > 0 && (
                          <div style={{ position: 'absolute', top: 3, left: 3, display: 'flex', flexWrap: 'wrap',
                            gap: 2, zIndex: 15, pointerEvents: 'none', maxWidth: '90%' }}>
                            {oppKeywords.map((kw) => (
                              <span key={kw} style={{
                                background: `${KEYWORD_COLOR[kw] ?? '#64748b'}33`,
                                border: `1px solid ${KEYWORD_COLOR[kw] ?? '#64748b'}88`,
                                color: KEYWORD_COLOR[kw] ?? '#e2e8f0',
                                borderRadius: 3, padding: '1px 3px', fontSize: 7, fontWeight: 800,
                              }}>{KEYWORD_ABBR[kw] ?? kw.slice(0, 3).toUpperCase()}</span>
                            ))}
                          </div>
                        )}
                        {/* Counter badges */}
                        {oppHasCounters && (
                          <div style={{ position: 'absolute', bottom: 3, left: 3, display: 'flex', flexWrap: 'wrap',
                            gap: 2, zIndex: 15, pointerEvents: 'none', maxWidth: '70%' }}>
                            {Object.entries(oppCounters).filter(([, n]) => n > 0).map(([type, n]) => (
                              <CounterBadge key={type} type={type} count={n} />
                            ))}
                          </div>
                        )}
                        {/* P/T bar */}
                        <PtBar card={card} />
                        {/* Stack count badge */}
                        {showBadge && (
                          <div style={{ position: 'absolute', top: -7, left: -7, zIndex: 30,
                            background: '#2563eb', color: '#fff', borderRadius: 5,
                            padding: '1px 5px', fontSize: 10, fontWeight: 900,
                            border: '2px solid #1e293b', pointerEvents: 'none' }}>
                            ×{slot.groupSize}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}

              {/* Graveyard + exile piles */}
              <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 8, zIndex: 3 }}>
                {player.graveyard.length > 0 && (
                  <MiniPile cards={player.graveyard} label="GY" color="#9ca3af"
                    onHover={onHover} onHoverEnd={onHoverEnd} />
                )}
                {player.exile.length > 0 && (
                  <MiniPile cards={player.exile} label="EX" color="#a78bfa"
                    onHover={onHover} onHoverEnd={onHoverEnd} />
                )}
              </div>

              {/* Hand card backs */}
              {player.handCount > 0 && (
                <div style={{ position: 'absolute', bottom: 10, left: 12, display: 'flex', alignItems: 'flex-end', gap: 2, zIndex: 3 }}>
                  {Array.from({ length: Math.min(player.handCount, 10) }).map((_, i2) => (
                    <CardBack key={i2} style={{ width: 18, height: 26,
                      transform: `rotate(${(i2 - Math.min(player.handCount, 10) / 2) * 2}deg)` }} />
                  ))}
                  <span style={{ fontSize: 9, color: '#4b5563', marginLeft: 4, fontWeight: 600 }}>
                    {player.handCount}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* My zone */}
        <div style={{
          position: 'absolute', left: layout.my.x, top: layout.my.y,
          width: layout.my.w, height: layout.my.h,
          borderRadius: 14,
          border: me.isActive ? `2px solid ${myColor}cc` : `2px solid ${myColor}55`,
          background: me.isActive ? `${myColor}18` : `${myColor}0e`,
          boxShadow: me.isActive ? `0 0 50px ${myColor}28, inset 0 0 30px ${myColor}08` : `inset 0 0 20px ${myColor}06`,
        }}>

          {/* My name label */}
          <div style={{ position: 'absolute', top: 7, left: 14, zIndex: 2, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', gap: 6 }}>
            {me.isActive && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#facc15',
                boxShadow: '0 0 6px #facc15', display: 'inline-block' }} />
            )}
            {me.socketId === monarchSocketId && (
              <span style={{ fontSize: 12, lineHeight: 1 }} title="You are the Monarch">👑</span>
            )}
            <span style={{ fontSize: 13, fontWeight: 800, color: `${myColor}ee` }}>{me.playerName}</span>
          </div>

          {/* Drop highlight overlay */}
          {overBf && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 14, zIndex: 1, pointerEvents: 'none',
              border: '2px solid rgba(134,239,172,0.7)',
              background: 'rgba(134,239,172,0.06)',
              boxShadow: '0 0 30px rgba(134,239,172,0.12)' }} />
          )}

          {/* Drop capture */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverBf(true); }}
            onDragLeave={() => setOverBf(false)}
            onDrop={(e) => {
              e.preventDefault(); setOverBf(false);
              try {
                const d: DragData = JSON.parse(e.dataTransfer.getData('application/json'));
                if (d.source === 'hand') onPlayCard(d.instanceId);
              } catch { /* */ }
            }}
            onMouseDown={e => e.stopPropagation()} />

          {/* Empty hint */}
          {me.battlefield.length === 0 && (
            <p style={{ position: 'absolute', left: C_LBLW, top: MY_LABEL_H + 12,
              color: 'rgba(255,255,255,0.06)', fontSize: 13, pointerEvents: 'none', fontStyle: 'italic' }}>
              Drag cards from hand to play here
            </p>
          )}

          {/* Card rows */}
          {myRows.map(row => (
            <React.Fragment key={row.label}>
              <div style={{ position: 'absolute', left: 0, top: rowBaseY + row.y + row.cH / 2 - 8,
                width: C_LBLW - 4, textAlign: 'right', pointerEvents: 'none' }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                  color: row.isLand ? 'rgba(134,239,172,0.7)' : 'rgba(255,255,255,0.55)' }}>
                  {row.label.split('/')[0].toUpperCase()}
                </span>
              </div>
              {row.slots.map(slot => {
                const card = myCardMap.get(slot.id);
                if (!card) return null;
                const showBadge = slot.groupSize > 1 && slot.groupIndex === slot.groupSize - 1;
                return (
                  <div key={slot.id} style={{ position: 'absolute', left: slot.x, top: rowBaseY + row.y, zIndex: 2 + slot.groupIndex }}
                    onMouseDown={e => e.stopPropagation()}>
                    {showBadge && (
                      <div style={{ position: 'absolute', top: -7, left: -7, zIndex: 30,
                        background: '#2563eb', color: '#fff', borderRadius: 5,
                        padding: '1px 5px', fontSize: 10, fontWeight: 900,
                        border: '2px solid #1e293b', pointerEvents: 'none' }}>
                        ×{slot.groupSize}
                      </div>
                    )}
                    <MyBattlefieldCard
                      card={card} cardW={row.cW} cardH={row.cH}
                      onTap={() => onTapCard(card.instanceId)}
                      onGraveyard={() => onGraveyardCard(card.instanceId)}
                      onExile={() => onExileCard(card.instanceId)}
                      onReturnCommander={() => onReturnCmdCard(card.instanceId)}
                      onReturnHand={() => onReturnHandCard(card.instanceId)}
                      onGiveControl={(targetSocketId) => onGiveControl(card.instanceId, targetSocketId)}
                      opponents={opponents.map((o) => ({ socketId: o.socketId, playerName: o.playerName }))}
                      onDragStart={e => onDragStartCard(e, card.instanceId)}
                      onHover={(c) => { onBfCardHover(c.instanceId); onHover(c); }}
                      onHoverEnd={() => { onBfCardHover(null); onHoverEnd(); }}
                      onUpdateCounter={(counter, delta) => onUpdateCounter(card.instanceId, counter, delta)}
                      onSetPt={(power, toughness) => onSetPt(card.instanceId, power, toughness)}
                      onSetKeywords={(kws) => onSetKeywords(card.instanceId, kws)}
                    />
                  </div>
                );
              })}
            </React.Fragment>
          ))}

          {/* ── Blocking Zone card tray (during opponent's combat) ── */}
          {isDefendingPhase && (
            <div style={{
              position: 'absolute', left: 14, right: 14, top: MY_LABEL_H + 4, height: BLOCK_ZONE_H,
              border: blockersDeclared ? '2px solid rgba(134,239,172,0.7)' : '2px solid rgba(239,68,68,0.7)',
              borderRadius: 10, zIndex: 10,
              background: overBlockers ? 'rgba(239,68,68,0.13)' : 'rgba(15,10,10,0.75)',
              boxShadow: blockersDeclared ? '0 0 16px rgba(134,239,172,0.15)' : '0 0 18px rgba(239,68,68,0.25)',
              transition: 'background 0.15s',
              display: 'flex', flexDirection: 'column',
            }}
              onDragOver={(e) => { e.preventDefault(); setOverBlockers(true); }}
              onDragLeave={() => setOverBlockers(false)}
              onDrop={(e) => {
                e.preventDefault(); setOverBlockers(false);
                try {
                  const d: DragData = JSON.parse(e.dataTransfer.getData('application/json'));
                  if (d.source !== 'battlefield') return;
                  const card = me.battlefield.find(c => c.instanceId === d.instanceId);
                  if (card && card.typeLine?.includes('Creature') && !card.tapped && !blockerIdSet.has(d.instanceId)) {
                    setBlockerCards(prev => [...prev, card]);
                  }
                } catch { /* */ }
              }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '5px 12px', borderBottom: '1px solid rgba(239,68,68,0.2)', flexShrink: 0 }}
                onMouseDown={e => e.stopPropagation()}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                  color: blockersDeclared ? '#86efac' : '#f87171' }}>
                  {blockersDeclared
                    ? `✓ ${blockerCards.length} blocker${blockerCards.length !== 1 ? 's' : ''} confirmed`
                    : `🛡 Blocking Zone${blockerCards.length > 0 ? ` — ${blockerCards.length} creature${blockerCards.length !== 1 ? 's' : ''}` : ' — drag untapped creatures here'}`}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {blockerCards.length > 0 && !blockersDeclared && (
                    <button
                      onClick={(e) => { e.stopPropagation(); socket.emit('game:declare_blockers', { blockerIds: blockerCards.map(c => c.instanceId) }); setBlockersDeclared(true); }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ fontSize: 10, fontWeight: 800, padding: '3px 12px', borderRadius: 6,
                        background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.6)',
                        color: '#fca5a5', cursor: 'pointer' }}>
                      Confirm Blockers
                    </button>
                  )}
                  {blockerCards.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setBlockerCards([]); setBlockersDeclared(false); }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#94a3b8', cursor: 'pointer' }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {/* Cards */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: C_HGAP,
                padding: '4px 12px', overflowX: 'auto', overflowY: 'hidden' }}
                onMouseDown={e => e.stopPropagation()}>
                {blockerCards.length === 0 ? (
                  <span style={{ color: 'rgba(239,68,68,0.3)', fontSize: 11, fontStyle: 'italic', margin: 'auto' }}>
                    Drop untapped creatures here
                  </span>
                ) : blockerCards.map(card => (
                  <div key={card.instanceId} style={{ position: 'relative', flexShrink: 0 }}
                    title="Right-click → send to graveyard"
                    onContextMenu={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setBlockerCards(prev => prev.filter(c => c.instanceId !== card.instanceId));
                      onGraveyardCard(card.instanceId);
                    }}>
                    <TappedCardWrapper card={card} cardW={C_W_BASE} cardH={C_H_BASE}>
                      <div className="w-full h-full">
                        {card.faceDown ? (
                          <div className="w-full h-full rounded-lg flex items-center justify-center"
                            style={{ background: '#1e1b4b', border: '2px solid rgba(239,68,68,0.6)' }}>
                            <span style={{ fontSize: 22, opacity: 0.3 }}>🂠</span>
                          </div>
                        ) : card.imageUri ? (
                          <img src={card.imageUri} alt={card.name} className="w-full h-full object-cover rounded-lg"
                            style={{ border: '2px solid rgba(239,68,68,0.65)',
                              boxShadow: '0 0 10px rgba(239,68,68,0.4)' }} />
                        ) : (
                          <div className="w-full h-full rounded-lg flex items-center justify-center"
                            style={{ background: '#1f2937', border: '2px solid rgba(239,68,68,0.6)' }}>
                            <span style={{ fontSize: 9, color: '#6b7280' }}>{card.name.slice(0, 10)}</span>
                          </div>
                        )}
                      </div>
                    </TappedCardWrapper>
                    <PtBar card={card} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Graveyard + Exile drop zones ── */}
          <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', gap: 14, zIndex: 4 }}
            onMouseDown={e => e.stopPropagation()}>
            <CanvasPileZone
              cards={gyCards} icon="🪦" label="Graveyard" color="#9ca3af" bgColor="#374151"
              isOver={overGy}
              onDragOver={() => setOverGy(true)}
              onDragLeave={() => setOverGy(false)}
              onDrop={(d) => { setOverGy(false); onDropToGy(d); }}
              onClick={onOpenGy}
              onHover={onHover} onHoverEnd={onHoverEnd}
            />
            <CanvasPileZone
              cards={exCards} icon="✦" label="Exile" color="#a78bfa" bgColor="#4c1d95"
              isOver={overEx}
              onDragOver={() => setOverEx(true)}
              onDragLeave={() => setOverEx(false)}
              onDrop={(d) => { setOverEx(false); onDropToEx(d); }}
              onClick={onOpenEx}
              onHover={onHover} onHoverEnd={onHoverEnd}
            />
          </div>
        </div>
      </div>

      {/* ── HUD (fixed over canvas) ── */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 pointer-events-none">
        <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.22)' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="pointer-events-auto text-[9px] font-bold px-2 py-1 rounded-lg transition hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { e.stopPropagation(); fitTable(); }}
          onMouseDown={e => e.stopPropagation()}>
          ⊡ Fit Table
        </button>
      </div>
    </div>
  );
}

// ── Commander damage matrix ───────────────────────────────────────────────────

function CmdDamageMatrix({ players, mySocketId, onUpdate }: {
  players: PersonalPlayerState[]; mySocketId: string;
  onUpdate: (from: string, delta: number) => void;
}) {
  const me = players.find((p) => p.socketId === mySocketId);
  const opponents = players.filter((p) => p.socketId !== mySocketId && !p.eliminated);
  if (!me || opponents.length === 0) return null;
  return (
    <div className="rounded-xl shrink-0"
      style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)', minWidth: 160, padding: '8px 10px' }}>
      <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.28)' }}>
        Cmd Dmg → You
      </p>
      <div className="flex flex-col gap-1.5">
        {opponents.map((src) => {
          const dmg = me.commanderDamage[src.socketId] ?? 0;
          const lethal = dmg >= 21, warn = dmg >= 17;
          const numColor = lethal ? '#ef4444' : warn ? '#f97316' : '#e2e8f0';
          return (
            <div key={src.socketId} className="flex items-center gap-1.5">
              <span className="text-[10px] truncate flex-1" style={{ color: '#94a3b8', maxWidth: 64 }}
                title={src.playerName}>{src.playerName.split(' ')[0]}</span>
              <button onClick={() => onUpdate(src.socketId, -1)}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#6b7280', fontSize: 14 }}>−</button>
              <span className="font-black font-mono tabular-nums text-base w-8 text-center"
                style={{ color: numColor, textShadow: lethal ? '0 0 8px #ef4444' : 'none' }}>{dmg}</span>
              <button onClick={() => onUpdate(src.socketId, 1)}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#6b7280', fontSize: 14 }}>+</button>
              {lethal && <span className="text-[8px] font-black animate-pulse" style={{ color: '#ef4444' }}>KO</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Token creation ────────────────────────────────────────────────────────────

function wrapSvgText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) { cur = next; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function makeTokenImageUri(name: string, pt: string, color: string, oracleText = ''): string {
  const bg: Record<string, string> = {
    white: '#cfc08a', blue: '#1c3d6b', black: '#1a1228', red: '#6b1c1c', green: '#1c4a2a', colorless: '#3a3a4a',
  };
  const bd: Record<string, string> = {
    white: '#a89850', blue: '#4a7ec4', black: '#7a4ab4', red: '#c44a4a', green: '#4a9a5a', colorless: '#7a7a8a',
  };
  const bgC = bg[color] ?? bg.colorless;
  const bdC = bd[color] ?? bd.colorless;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const n = esc(name);
  const hasNoPt = !pt || pt === '/';
  let body = '';
  if (hasNoPt && oracleText) {
    const lines = wrapSvgText(oracleText, 26).slice(0, 9);
    body = lines.map((l, i) =>
      `<text x="100" y="${132 + i * 13}" font-family="Georgia,serif" font-size="8" fill="rgba(255,255,255,0.82)" text-anchor="middle">${esc(l)}</text>`
    ).join('');
  } else if (!hasNoPt) {
    body = `<rect x="55" y="168" width="90" height="38" rx="6" fill="rgba(0,0,0,0.45)" stroke="${bdC}" stroke-width="1"/><text x="100" y="194" font-family="Georgia,serif" font-size="22" fill="white" text-anchor="middle" font-weight="bold">${esc(pt)}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280"><rect width="200" height="280" rx="10" fill="${bgC}" stroke="${bdC}" stroke-width="3"/><rect x="8" y="8" width="184" height="264" rx="7" fill="none" stroke="${bdC}" stroke-width="1" opacity="0.5"/><text x="100" y="108" font-family="Georgia,serif" font-size="13" fill="white" text-anchor="middle" font-weight="bold">${n}</text>${body}<text x="100" y="262" font-family="Georgia,serif" font-size="9" fill="rgba(255,255,255,0.35)" text-anchor="middle">TOKEN</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const TOKEN_COLORS = ['white', 'blue', 'black', 'red', 'green', 'colorless'] as const;
type TokenColor = typeof TOKEN_COLORS[number];

const TOKEN_COLOR_SWATCHES: Record<TokenColor, string> = {
  white: '#cfc08a', blue: '#4a7eb5', black: '#7a4ab4', red: '#c44a4a', green: '#4a9a5a', colorless: '#7a7a8a',
};

const TOKEN_PRESETS: { name: string; power: string; toughness: string; color: TokenColor; typeLine: string; oracleText?: string; kind: 'creature' | 'artifact' }[] = [
  // ── Green creatures
  { kind: 'creature', name: 'Saproling',  power: '1', toughness: '1', color: 'green',     typeLine: 'Token Creature — Saproling' },
  { kind: 'creature', name: 'Elf',        power: '1', toughness: '1', color: 'green',     typeLine: 'Token Creature — Elf' },
  { kind: 'creature', name: 'Snake',      power: '1', toughness: '1', color: 'green',     typeLine: 'Token Creature — Snake' },
  { kind: 'creature', name: 'Bear',       power: '2', toughness: '2', color: 'green',     typeLine: 'Token Creature — Bear' },
  { kind: 'creature', name: 'Wolf',       power: '2', toughness: '2', color: 'green',     typeLine: 'Token Creature — Wolf' },
  { kind: 'creature', name: 'Beast',      power: '3', toughness: '3', color: 'green',     typeLine: 'Token Creature — Beast' },
  { kind: 'creature', name: 'Elephant',   power: '3', toughness: '3', color: 'green',     typeLine: 'Token Creature — Elephant' },
  { kind: 'creature', name: 'Elemental',  power: '4', toughness: '4', color: 'green',     typeLine: 'Token Creature — Elemental' },
  { kind: 'creature', name: 'Wurm',       power: '5', toughness: '5', color: 'green',     typeLine: 'Token Creature — Wurm' },
  { kind: 'creature', name: 'Wurm',       power: '6', toughness: '6', color: 'green',     typeLine: 'Token Creature — Wurm' },
  // ── White creatures
  { kind: 'creature', name: 'Human',      power: '1', toughness: '1', color: 'white',     typeLine: 'Token Creature — Human' },
  { kind: 'creature', name: 'Cat',        power: '1', toughness: '1', color: 'white',     typeLine: 'Token Creature — Cat' },
  { kind: 'creature', name: 'Soldier',    power: '1', toughness: '1', color: 'white',     typeLine: 'Token Creature — Soldier' },
  { kind: 'creature', name: 'Spirit',     power: '1', toughness: '1', color: 'white',     typeLine: 'Token Creature — Spirit (Flying)' },
  { kind: 'creature', name: 'Egg',        power: '0', toughness: '1', color: 'white',     typeLine: 'Token Creature — Egg' },
  { kind: 'creature', name: 'Knight',     power: '2', toughness: '2', color: 'white',     typeLine: 'Token Creature — Knight (Vigilance)' },
  { kind: 'creature', name: 'Angel',      power: '3', toughness: '3', color: 'white',     typeLine: 'Token Creature — Angel (Flying, Vigilance)' },
  // ── Black creatures
  { kind: 'creature', name: 'Zombie',     power: '1', toughness: '1', color: 'black',     typeLine: 'Token Creature — Zombie' },
  { kind: 'creature', name: 'Zombie',     power: '2', toughness: '2', color: 'black',     typeLine: 'Token Creature — Zombie' },
  { kind: 'creature', name: 'Rat',        power: '1', toughness: '1', color: 'black',     typeLine: 'Token Creature — Rat' },
  // ── Red creatures
  { kind: 'creature', name: 'Goblin',     power: '1', toughness: '1', color: 'red',       typeLine: 'Token Creature — Goblin' },
  { kind: 'creature', name: 'Devil',      power: '1', toughness: '1', color: 'red',       typeLine: 'Token Creature — Devil' },
  { kind: 'creature', name: 'Dragon',     power: '2', toughness: '2', color: 'red',       typeLine: 'Token Creature — Dragon (Flying)' },
  { kind: 'creature', name: 'Dragon',     power: '4', toughness: '4', color: 'red',       typeLine: 'Token Creature — Dragon (Flying)' },
  // ── Blue creatures
  { kind: 'creature', name: 'Bird',       power: '1', toughness: '1', color: 'blue',      typeLine: 'Token Creature — Bird (Flying)' },
  { kind: 'creature', name: 'Drake',      power: '2', toughness: '2', color: 'blue',      typeLine: 'Token Creature — Drake (Flying)' },
  // ── Colorless artifact creatures
  { kind: 'creature', name: 'Thopter',    power: '1', toughness: '1', color: 'colorless', typeLine: 'Token Artifact Creature — Thopter (Flying)' },
  // ── Artifact tokens (no P/T)
  { kind: 'artifact', name: 'Clue',     power: '', toughness: '', color: 'colorless', typeLine: 'Artifact — Clue',     oracleText: '2, Sacrifice this artifact: Draw a card.' },
  { kind: 'artifact', name: 'Treasure', power: '', toughness: '', color: 'colorless', typeLine: 'Artifact — Treasure', oracleText: 'T, Sacrifice this artifact: Add one mana of any color.' },
  { kind: 'artifact', name: 'Food',     power: '', toughness: '', color: 'colorless', typeLine: 'Artifact — Food',     oracleText: '2, T, Sacrifice this artifact: You gain 3 life.' },
  { kind: 'artifact', name: 'Map',      power: '', toughness: '', color: 'colorless', typeLine: 'Artifact — Map',      oracleText: '1, T, Sacrifice this artifact: Scry 1.' },
  { kind: 'artifact', name: 'Shard',    power: '', toughness: '', color: 'colorless', typeLine: 'Artifact — Shard',    oracleText: 'T, Sacrifice this artifact: Add one mana of any color. Spend this mana only to cast a colored spell or activate an ability.' },
  { kind: 'artifact', name: 'Gold',     power: '', toughness: '', color: 'colorless', typeLine: 'Artifact — Gold',     oracleText: 'Sacrifice this artifact: Add one mana of any color.' },
  { kind: 'artifact', name: 'Blood',    power: '', toughness: '', color: 'colorless', typeLine: 'Artifact — Blood',    oracleText: '1, T, Discard a card, Sacrifice this artifact: Draw a card.' },
];

function TokenCreateModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string, power: string, toughness: string, color: TokenColor, typeLine: string, oracleText: string) => void;
}) {
  const [name, setName]           = useState('');
  const [power, setPower]         = useState('1');
  const [toughness, setToughness] = useState('1');
  const [color, setColor]         = useState<TokenColor>('green');
  const [typeLine, setTypeLine]   = useState('Token Creature');
  const [oracleText, setOracleText] = useState('');
  const [qty, setQty]             = useState(1);

  const creaturePresets = TOKEN_PRESETS.filter(p => p.kind === 'creature');
  const artifactPresets = TOKEN_PRESETS.filter(p => p.kind === 'artifact');

  function applyPreset(p: typeof TOKEN_PRESETS[0]) {
    setName(p.name); setPower(p.power); setToughness(p.toughness);
    setColor(p.color); setTypeLine(p.typeLine); setOracleText(p.oracleText ?? '');
  }

  const presetBtn = (p: typeof TOKEN_PRESETS[0], idx: number) => (
    <button key={idx} onClick={() => applyPreset(p)}
      className="text-xs px-2 py-1 rounded-lg transition hover:brightness-110"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db', whiteSpace: 'nowrap' }}>
      {p.power !== '' ? `${p.power}/${p.toughness} ` : ''}{p.name}
    </button>
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', zIndex: 10000 }}
      onClick={onClose}>
      <div className="rounded-2xl p-5 flex flex-col gap-3 w-full overflow-y-auto"
        style={{ maxWidth: 400, maxHeight: '92vh', background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 80px rgba(0,0,0,0.9)' }}
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Create Token</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg transition hover:bg-white/10"
            style={{ color: '#6b7280' }}>×</button>
        </div>

        {/* Creature Tokens */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Creature Tokens</p>
          <div className="overflow-y-auto" style={{ maxHeight: 110 }}>
            <div className="flex flex-wrap gap-1.5">
              {creaturePresets.map(presetBtn)}
            </div>
          </div>
        </div>

        {/* Artifact Tokens */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>Artifact Tokens</p>
          <div className="flex flex-wrap gap-1.5">
            {artifactPresets.map(presetBtn)}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saproling" autoFocus
            className="px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }} />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Power</label>
            <input value={power} onChange={(e) => setPower(e.target.value)} placeholder="—"
              className="px-3 py-2 rounded-lg text-sm focus:outline-none text-center"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }} />
          </div>
          <span className="pb-2 text-lg font-bold" style={{ color: '#4b5563' }}>/</span>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Toughness</label>
            <input value={toughness} onChange={(e) => setToughness(e.target.value)} placeholder="—"
              className="px-3 py-2 rounded-lg text-sm focus:outline-none text-center"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Color</label>
          <div className="flex gap-2 items-center">
            {TOKEN_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} title={c}
                className="rounded-full transition-transform hover:scale-110 relative flex items-center justify-center shrink-0"
                style={{ width: 28, height: 28, background: TOKEN_COLOR_SWATCHES[c],
                  border: color === c ? '2px solid white' : '2px solid transparent',
                  boxShadow: color === c ? `0 0 8px ${TOKEN_COLOR_SWATCHES[c]}` : 'none' }}>
                {c === 'colorless' && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1, pointerEvents: 'none' }}>∅</span>}
              </button>
            ))}
            <span className="text-xs ml-1 capitalize" style={{ color: '#6b7280' }}>{color}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Type Line</label>
          <input value={typeLine} onChange={(e) => setTypeLine(e.target.value)} placeholder="Token Creature — Saproling"
            className="px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Oracle Text <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <textarea value={oracleText} onChange={(e) => setOracleText(e.target.value)}
            placeholder="Ability text — shown on artifact tokens instead of P/T"
            rows={2}
            className="px-3 py-2 rounded-lg text-xs focus:outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }} />
        </div>

        {/* Quantity */}
        <div className="flex items-center gap-3">
          <label className="text-[10px] font-semibold uppercase tracking-widest shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>Quantity</label>
          <div className="flex items-center gap-2 flex-1">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-7 h-7 rounded-lg font-black transition hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#d1d5db' }}>−</button>
            <span className="font-black text-base text-center" style={{ color: '#f1f5f9', minWidth: 28 }}>{qty}</span>
            <button onClick={() => setQty(q => Math.min(20, q + 1))}
              className="w-7 h-7 rounded-lg font-black transition hover:bg-white/10"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#d1d5db' }}>+</button>
          </div>
        </div>

        <button
          onClick={() => { if (name.trim()) { for (let i = 0; i < qty; i++) onCreate(name.trim(), power, toughness, color, typeLine, oracleText); onClose(); } }}
          disabled={!name.trim()}
          className="w-full py-3 rounded-xl font-bold text-sm transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #166534, #14532d)',
            border: '1px solid rgba(74,222,128,0.3)', color: '#86efac',
            boxShadow: '0 0 16px rgba(74,222,128,0.15)' }}>
          ✦ Create {qty > 1 ? `${qty}× ` : ''}Token{qty > 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GameBoardPage() {
  const { roomId: _roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [gameState, setGameState] = useState<PersonalGameState | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [hoverCard, setHoverCard] = useState<GameCard | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [showTokenModal, setShowTokenModal] = useState(false);
  const hoverBfCardId = useRef<string | null>(null);
  const myBattlefieldRef = useRef<GameCard[]>([]);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  const [zoneModal, setZoneModal] = useState<'graveyard' | 'exile' | 'library' | null>(null);
  const [libraryCards, setLibraryCards] = useState<GameCard[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [scryInputOpen, setScryInputOpen] = useState(false);
  const [scryCards, setScryCards] = useState<GameCard[] | null>(null);
  const [showConcedePopup, setShowConcedePopup] = useState(false);
  const [millInputOpen, setMillInputOpen] = useState(false);
  const [millCards, setMillCards] = useState<GameCard[] | null>(null);
  const [showDicePanel, setShowDicePanel] = useState(false);
  const [diceResult, setDiceResult] = useState<{ playerName: string; sides: number; result: number } | null>(null);
  const diceResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [timingToast, setTimingToast] = useState<string | null>(null);
  const [overHand, setOverHand] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [commanderPopup, setCommanderPopup] = useState<{
    cardName: string; instanceId: string; destination: 'graveyard' | 'exile';
  } | null>(null);
  const commanderScryfallId = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id;
    const rejoin = () => socket.emit('game:rejoin', { userId });

    if (!socket.connected) socket.connect();
    socket.on('connect', rejoin);
    socket.on('game:state', setGameState);
    socket.on('game:library_contents', (cards) => { setLibraryCards(cards); setLibraryLoading(false); });
    socket.on('game:scry_cards', (cards) => { setScryCards(cards); setScryInputOpen(false); });
    socket.on('game:mill_result', (cards) => { setMillCards(cards); setMillInputOpen(false); });
    socket.on('game:dice_result', (data) => {
      setDiceResult(data);
      if (diceResultTimer.current) clearTimeout(diceResultTimer.current);
      diceResultTimer.current = setTimeout(() => setDiceResult(null), 5000);
    });
    socket.on('game:error', (msg) => {
      setTimingToast(msg);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setTimingToast(null), 4500);
    });
    socket.on('game:announcement', ({ message }) => {
      setAnnouncement(message);
      if (announcementTimer.current) clearTimeout(announcementTimer.current);
      announcementTimer.current = setTimeout(() => setAnnouncement(null), 6000);
    });
    socket.on('blockersDeclared', ({ playerName, blockerIds }) => {
      setTimingToast(`🛡 ${playerName} declared ${blockerIds.length} blocker${blockerIds.length !== 1 ? 's' : ''}`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setTimingToast(null), 4000);
    });
    socket.on('cardCounterUpdate', ({ playerId, instanceId, counters }) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.socketId !== playerId ? p : {
              ...p,
              battlefield: p.battlefield.map((c) =>
                c.instanceId !== instanceId ? c : { ...c, counters }
              ),
            }
          ),
        };
      });
    });
    rejoin();
    return () => {
      socket.off('connect', rejoin);
      socket.off('game:state', setGameState);
      socket.off('game:library_contents');
      socket.off('game:scry_cards');
      socket.off('game:mill_result');
      socket.off('game:dice_result');
      socket.off('game:error');
      socket.off('game:announcement');
      socket.off('blockersDeclared');
      socket.off('cardCounterUpdate');
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (announcementTimer.current) clearTimeout(announcementTimer.current);
    };
  }, [user?.id]);

  useEffect(() => {
    const me = gameState?.players.find((p) => p.socketId === gameState.mySocketId);
    if (me?.commandZone.length && !commanderScryfallId.current) {
      commanderScryfallId.current = me.commandZone[0].scryfallId;
    }
  }, [gameState]);

  // Keyboard shortcuts for hovered battlefield card
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const id = hoverBfCardId.current;
      if (!id) return;
      const card = myBattlefieldRef.current.find(c => c.instanceId === id);
      const isCmd = !!card && !!commanderScryfallId.current && card.scryfallId === commanderScryfallId.current;
      const k = e.key;
      if (k === 't' || k === 'T') { socket.emit('game:tap_card', { instanceId: id }); return; }
      if (k === 'g' || k === 'G') {
        if (isCmd) setCommanderPopup({ cardName: card.name, instanceId: id, destination: 'graveyard' });
        else socket.emit('game:move_to_graveyard', { instanceId: id });
        setHoverCard(null); return;
      }
      if (k === 'e' || k === 'E') {
        if (isCmd) setCommanderPopup({ cardName: card.name, instanceId: id, destination: 'exile' });
        else socket.emit('game:move_to_exile', { instanceId: id });
        setHoverCard(null); return;
      }
      if (k === 'h' || k === 'H') { socket.emit('game:move_to_hand', { instanceId: id }); setHoverCard(null); return; }
      if (k === 'c' || k === 'C') { socket.emit('game:copy_card', { instanceId: id }); return; }
      if (k === 'f' || k === 'F') { socket.emit('game:flip_card', { instanceId: id }); return; }
      if (k === '+' || k === '=') { socket.emit('game:update_counter', { instanceId: id, counter: '+1/+1', delta: 1 }); return; }
      if (k === '-' || k === '_') { socket.emit('game:update_counter', { instanceId: id, counter: '+1/+1', delta: -1 }); return; }
      if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        if (isCmd) setCommanderPopup({ cardName: card!.name, instanceId: id, destination: 'graveyard' });
        else socket.emit('game:move_to_graveyard', { instanceId: id });
        setHoverCard(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function openLibraryModal() {
    setZoneModal('library'); setLibraryCards([]); setLibraryLoading(true);
    socket.emit('game:request_library');
  }

  function closeLibraryModal() {
    setZoneModal(null);
    socket.emit('game:shuffle_library');
    // Show "Library shuffled" in the toast
    setTimingToast('📚 Library shuffled');
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setTimingToast(null), 2500);
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

  const mySocketId = gameState.mySocketId;
  const me         = gameState.players.find((p) => p.socketId === mySocketId);
  myBattlefieldRef.current = me?.battlefield ?? [];
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

  // ── Emit helpers ─────────────────────────────────────────────────────────────

  const emit = {
    drawCard:     ()           => socket.emit('game:draw_card'),
    playCard:     (id: string) => socket.emit('game:play_card',             { instanceId: id }),
    tapCard:      (id: string) => socket.emit('game:tap_card',              { instanceId: id }),
    endPhase:     ()           => socket.emit('game:end_phase'),
    endTurn:      ()           => socket.emit('game:end_turn'),
    updateLife:   (d: number)  => socket.emit('game:update_life',           { delta: d }),
    updateCmdDmg: (f: string, d: number) => socket.emit('game:update_commander_damage', { fromSocketId: f, delta: d }),
    toGraveyard:  (id: string) => socket.emit('game:move_to_graveyard',     { instanceId: id }),
    toExile:      (id: string) => socket.emit('game:move_to_exile',         { instanceId: id }),
    toHand:       (id: string) => socket.emit('game:move_to_hand',          { instanceId: id }),
    returnToBf:   (id: string) => socket.emit('game:return_to_battlefield', { instanceId: id }),
    returnCmd:    (id: string) => socket.emit('game:return_commander',      { instanceId: id }),
    castCommander: ()          => socket.emit('game:cast_commander'),
    tutor:        (id: string, to: 'hand' | 'battlefield') => socket.emit('game:tutor', { instanceId: id, to }),
    createToken:  (name: string, power: string, toughness: string, color: string, typeLine: string, oracleText = '') => {
      const pt = (power || toughness) ? `${power}/${toughness}` : '';
      const imageUri = makeTokenImageUri(name, pt, color, oracleText);
      socket.emit('game:create_token', { name, power, toughness, color, typeLine, imageUri, oracleText });
    },
    copyCard:       (instanceId: string) => socket.emit('game:copy_card', { instanceId }),
    flipCard:       (instanceId: string) => socket.emit('game:flip_card', { instanceId }),
    shuffleLibrary: () => socket.emit('game:shuffle_library'),
    updateCounter:  (instanceId: string, counter: string, delta: number) =>
      socket.emit('game:update_counter', { instanceId, counter, delta }),
    setPt:          (instanceId: string, power: string, toughness: string) =>
      socket.emit('game:set_pt', { instanceId, power, toughness }),
    giveControl:         (instanceId: string, targetSocketId: string) =>
      socket.emit('game:give_control', { instanceId, targetSocketId }),
    confirmElimination:  (targetSocketId: string) =>
      socket.emit('game:confirm_elimination', { targetSocketId }),
    cancelElimination:   () =>
      socket.emit('game:cancel_elimination'),
    scry:                (count: number) =>
      socket.emit('game:scry', { count }),
    scryResolve:         (keepOnTop: string[], putOnBottom: string[]) =>
      socket.emit('game:scry_resolve', { keepOnTop, putOnBottom }),
    mulligan:            () => socket.emit('game:mulligan'),
    mulliganKeep:        () => socket.emit('game:mulligan_keep'),
    concede:             () => socket.emit('game:concede'),
    mill:                (count: number) => socket.emit('game:mill', { count }),
    rollDice:            (sides: number) => socket.emit('game:roll_dice', { sides }),
    claimMonarch:        () => socket.emit('game:claim_monarch'),
    updatePoison:        (delta: number) => socket.emit('game:update_poison', { delta }),
    setKeywords:         (instanceId: string, keywords: string[]) => socket.emit('game:set_keywords', { instanceId, keywords }),
    setLandsPlayable:    (delta: number) => socket.emit('game:set_lands_playable', { delta }),
  };

  // ── Timing helper ─────────────────────────────────────────────────────────────

  function cardTimingStatus(card: GameCard): { playable: boolean; reason: string } {
    const isInstant = card.typeLine?.includes('Instant') ?? false;
    if (isInstant) return { playable: true, reason: 'Instant — can be played any time' };
    if (!isMyTurn) return { playable: false, reason: "It's not your turn — only instants can be played" };
    if (gameState!.phase !== 'main1' && gameState!.phase !== 'main2') {
      const phaseLabel = PHASES.find((p) => p.key === gameState!.phase)?.label ?? gameState!.phase;
      return { playable: false, reason: `Main Phase only — currently ${phaseLabel}` };
    }
    if (card.typeLine?.includes('Land') && me!.landsPlayedThisTurn >= me!.landsPlayable) {
      return { playable: false, reason: `Already played ${me!.landsPlayable} land${me!.landsPlayable !== 1 ? 's' : ''} this turn` };
    }
    return { playable: true, reason: '' };
  }

  // ── Commander replacement interception ────────────────────────────────────────

  function interceptGraveyard(instanceId: string) {
    const card = me!.battlefield.find((c) => c.instanceId === instanceId);
    if (card && commanderScryfallId.current && card.scryfallId === commanderScryfallId.current) {
      setCommanderPopup({ cardName: card.name, instanceId, destination: 'graveyard' });
    } else { emit.toGraveyard(instanceId); }
  }

  function interceptExile(instanceId: string) {
    const card = me!.battlefield.find((c) => c.instanceId === instanceId);
    if (card && commanderScryfallId.current && card.scryfallId === commanderScryfallId.current) {
      setCommanderPopup({ cardName: card.name, instanceId, destination: 'exile' });
    } else { emit.toExile(instanceId); }
  }

  function dragStart(e: React.DragEvent, instanceId: string, source: DragData['source']) {
    const data: DragData = { instanceId, source };
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const myCommander = me.commandZone[0];
  const lifeColor   = me.life <= 0 ? '#dc2626' : me.life <= 10 ? '#f97316' : '#4ade80';
  const tax         = me.commanderCastCount * 2;
  const taxColor    = tax === 0 ? '#4b5563' : tax >= 4 ? '#ef4444' : '#f97316';

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none" style={FELT}
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}>

      {/* ── Header ── */}
      <header className="shrink-0 flex items-center gap-4 px-5"
        style={{ height: 52, background: 'rgba(0,0,0,0.55)',
          borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)',
          position: 'relative', zIndex: 50 }}>
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs font-mono" style={{ color: '#4b5563' }}>T{gameState.turn}</span>
          <span className="text-sm font-bold" style={{ color: isMyTurn ? '#facc15' : '#e5e7eb' }}>
            {isMyTurn ? '⚡ Your Turn' : `${active?.playerName}'s Turn`}
          </span>
          {(!isMyTurn || (gameState.phase !== 'main1' && gameState.phase !== 'main2')) && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}>
              ⚡ Instants only
            </span>
          )}
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
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowDicePanel((v) => !v)}
              className="text-xs font-semibold px-2 py-1.5 rounded-lg transition hover:bg-white/10"
              style={{ color: showDicePanel ? '#fbbf24' : '#9ca3af' }}>🎲 Dice</button>
            {showDicePanel && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 9999,
                background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
                padding: '10px 12px', boxShadow: '0 16px 40px rgba(0,0,0,0.9)',
                display: 'flex', gap: 6, flexWrap: 'wrap', width: 220 }}>
                {[4,6,8,10,12,20].map((s) => (
                  <button key={s} onClick={() => { emit.rollDice(s); setShowDicePanel(false); }}
                    className="font-black text-xs rounded-lg transition hover:brightness-125"
                    style={{ flex: '1 1 60px', padding: '8px 4px',
                      background: s === 20 ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)',
                      border: s === 20 ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.12)',
                      color: s === 20 ? '#fbbf24' : '#d1d5db', cursor: 'pointer' }}>
                    d{s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setShowShortcutHelp(true)}
            className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center transition hover:bg-white/10"
            style={{ color: '#6b7280', border: '1px solid rgba(255,255,255,0.12)' }}
            title="Keyboard shortcuts">?</button>
          <button onClick={() => setShowLog(!showLog)} className="text-xs px-2 py-1.5 rounded-lg"
            style={{ color: showLog ? '#9ca3af' : '#4b5563' }}>Log {showLog ? '▾' : '▸'}</button>
          {!me.eliminated && (
            <button onClick={() => setShowConcedePopup(true)}
              className="text-xs font-semibold px-2 py-1.5 rounded-lg transition hover:bg-white/10"
              style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              Concede
            </button>
          )}
          <button onClick={() => navigate('/lobby')} className="text-xs px-2 py-1.5 transition hover:text-red-400"
            style={{ color: '#4b5563' }}>✕</button>
        </div>
      </header>

      {/* ── Shared table canvas (fills space between header and info bar) ── */}
      <div className="flex-1 overflow-hidden min-h-0">
        <TableCanvas
          me={me}
          opponents={opponents}
          isDefendingPhase={!isMyTurn && gameState.phase === 'combat'}
          onTapCard={emit.tapCard}
          onGraveyardCard={interceptGraveyard}
          onExileCard={interceptExile}
          onReturnCmdCard={emit.returnCmd}
          onReturnHandCard={emit.toHand}
          onGiveControl={emit.giveControl}
          onDragStartCard={(e, id) => dragStart(e, id, 'battlefield')}
          onPlayCard={emit.playCard}
          onHover={setHoverCard}
          onHoverEnd={() => { setHoverCard(null); hoverBfCardId.current = null; }}
          onBfCardHover={(id) => { hoverBfCardId.current = id; }}
          onUpdateCounter={emit.updateCounter}
          onSetPt={emit.setPt}
          onSetKeywords={emit.setKeywords}
          gyCards={me.graveyard}
          exCards={me.exile}
          onDropToGy={(d) => {
            if (d.source === 'hand') emit.toGraveyard(d.instanceId);
            else interceptGraveyard(d.instanceId);
          }}
          onDropToEx={(d) => {
            if (d.source === 'hand') emit.toExile(d.instanceId);
            else interceptExile(d.instanceId);
          }}
          onOpenGy={() => setZoneModal('graveyard')}
          onOpenEx={() => setZoneModal('exile')}
          monarchSocketId={gameState.monarchSocketId}
        />
      </div>

      {/* ── My fixed info bar ── */}
      <div className="shrink-0 flex items-center gap-4 px-4"
        style={{ height: 80, background: 'rgba(0,0,0,0.72)',
          borderTop: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}>

        {/* Life */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => emit.updateLife(-1)}
            className="w-8 h-8 rounded-xl font-black text-lg transition hover:scale-110"
            style={{ background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5' }}>−</button>
          <div className="text-center" style={{ minWidth: '3.8rem' }}>
            <span className="font-black font-mono tabular-nums"
              style={{ fontSize: '3.8rem', lineHeight: 1, color: lifeColor,
                textShadow: `0 0 16px ${lifeColor}55, 0 2px 4px rgba(0,0,0,0.8)` }}>
              {me.life}
            </span>
          </div>
          <button onClick={() => emit.updateLife(1)}
            className="w-8 h-8 rounded-xl font-black text-lg transition hover:scale-110"
            style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#86efac' }}>+</button>
        </div>

        {/* Poison counters */}
        <div className="flex items-center gap-1 shrink-0"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 12 }}>
          <button onClick={() => emit.updatePoison(-1)}
            className="w-6 h-6 rounded-lg font-black text-sm transition hover:scale-110"
            style={{ background: 'rgba(163,230,53,0.1)', border: '1px solid rgba(163,230,53,0.25)', color: '#a3e635' }}>−</button>
          <span className="text-sm font-black font-mono tabular-nums"
            style={{ color: me.poisonCounters > 0 ? '#a3e635' : '#374151', minWidth: '2.2rem', textAlign: 'center',
              textShadow: me.poisonCounters >= 8 ? '0 0 8px #a3e635' : 'none' }}>
            ☠️ {me.poisonCounters}
          </span>
          <button onClick={() => emit.updatePoison(1)}
            className="w-6 h-6 rounded-lg font-black text-sm transition hover:scale-110"
            style={{ background: 'rgba(163,230,53,0.1)', border: '1px solid rgba(163,230,53,0.25)', color: '#a3e635' }}>+</button>
        </div>

        {/* Land plays counter */}
        <div className="flex flex-col items-center gap-0.5 shrink-0"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 12 }}>
          <span style={{ fontSize: 9, color: '#4b5563', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Lands</span>
          <div className="flex items-center gap-1">
            <button onClick={() => emit.setLandsPlayable(-1)}
              className="w-5 h-5 rounded text-xs transition hover:bg-white/10"
              style={{ color: '#6b7280' }}>−</button>
            <span style={{ fontSize: 12, fontWeight: 900, color: me.landsPlayedThisTurn >= me.landsPlayable ? '#f97316' : '#4ade80',
              minWidth: 28, textAlign: 'center' }}>
              {me.landsPlayedThisTurn}/{me.landsPlayable}
            </span>
            <button onClick={() => emit.setLandsPlayable(1)}
              className="w-5 h-5 rounded text-xs transition hover:bg-white/10"
              style={{ color: '#6b7280' }}>+</button>
          </div>
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
            <div className="flex items-center gap-1 mt-0.5"
              title={tax === 0 ? 'No commander tax' : `Tax: +${tax} generic mana`}>
              <span className="text-[9px] font-bold" style={{ color: taxColor }}>
                {me.commanderCastCount === 0 ? 'No tax' : `Tax: +${tax}⧫`}
              </span>
              <span className="text-[8px]" style={{ color: '#374151' }}>(cast {me.commanderCastCount}×)</span>
            </div>
            {myCommander && (
              <button onClick={emit.castCommander}
                className="mt-1 text-xs font-bold px-3 py-1 rounded-md transition hover:brightness-110 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #d97706, #b45309)',
                  border: '1px solid #fbbf24', color: '#111',
                  boxShadow: '0 0 10px rgba(251,191,36,0.4)' }}>
                ⚡ Cast Commander
              </button>
            )}
          </div>
        </div>

        {/* Zone counts */}
        <div className="flex items-center gap-1.5 text-sm font-semibold"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 16 }}>
          <button onClick={openLibraryModal} title="Search library"
            className="flex items-center gap-1 px-2 py-1 rounded-lg transition hover:bg-white/10"
            style={{ color: '#94a3b8' }}>📚 {me.libraryCount}</button>
          <button onClick={() => setScryInputOpen(true)} title="Scry"
            className="text-xs font-bold px-2 py-1 rounded-lg transition hover:bg-white/10"
            style={{ color: '#7dd3fc', border: '1px solid rgba(125,211,252,0.2)' }}>
            Scry
          </button>
          <button onClick={() => setMillInputOpen(true)} title="Mill"
            className="text-xs font-bold px-2 py-1 rounded-lg transition hover:bg-white/10"
            style={{ color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
            Mill
          </button>
          <span style={{ color: '#94a3b8' }}>✋ {me.handCount}</span>
          <button onClick={() => setZoneModal('graveyard')} title="View graveyard"
            className="flex items-center gap-1 px-2 py-1 rounded-lg transition hover:bg-white/10"
            style={{ color: me.graveyard.length > 0 ? '#cbd5e1' : '#64748b' }}>
            🪦 {me.graveyard.length}
          </button>
          <button onClick={() => setZoneModal('exile')} title="View exile"
            className="flex items-center gap-1 px-2 py-1 rounded-lg transition hover:bg-white/10"
            style={{ color: me.exile.length > 0 ? '#c4b5fd' : '#64748b' }}>
            ✦ {me.exile.length}
          </button>
          <button onClick={() => setShowTokenModal(true)} title="Create a token"
            className="flex items-center gap-1 px-2 py-1 rounded-lg transition hover:bg-white/10 font-semibold"
            style={{ color: '#4b9a5a', border: '1px solid rgba(74,154,90,0.3)', background: 'rgba(74,154,90,0.08)' }}>
            ✦ Token
          </button>
        </div>

        {/* Commander damage matrix */}
        <div className="ml-auto shrink-0">
          <CmdDamageMatrix players={gameState.players} mySocketId={mySocketId} onUpdate={emit.updateCmdDmg} />
        </div>

        {/* Monarch */}
        <div className="flex flex-col items-center gap-0.5 shrink-0"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 12 }}>
          {(() => {
            const monarch = gameState.players.find((p) => p.socketId === gameState.monarchSocketId);
            return (
              <>
                <span style={{ fontSize: 9, color: '#4b5563', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Monarch</span>
                <span style={{ fontSize: 12, color: monarch ? '#fbbf24' : '#374151', fontWeight: 700 }}>
                  {monarch ? `👑 ${monarch.playerName.split(' ')[0]}` : '— none —'}
                </span>
                {gameState.monarchSocketId !== mySocketId && !me.eliminated && (
                  <button onClick={emit.claimMonarch}
                    className="text-[9px] font-bold px-2 py-0.5 rounded-md transition hover:brightness-110"
                    style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', cursor: 'pointer', marginTop: 1 }}>
                    Claim
                  </button>
                )}
              </>
            );
          })()}
        </div>

        {/* Player name */}
        <div className="flex items-center gap-2 shrink-0"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 12 }}>
          {isMyTurn && !me.eliminated && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#facc15', boxShadow: '0 0 6px #facc15' }} />}
          {gameState.monarchSocketId === mySocketId && <span style={{ fontSize: 14 }} title="You are the Monarch">👑</span>}
          <span className="text-sm font-bold" style={{ color: me.eliminated ? '#6b7280' : '#f9fafb' }}>{me.playerName}</span>
          {me.eliminated && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}>
              ELIMINATED
            </span>
          )}
        </div>
      </div>

      {/* ── Spectator overlay (shown when local player is eliminated) ── */}
      {me.eliminated && (
        <div className="fixed top-14 left-1/2 z-40 px-4 py-2 rounded-full pointer-events-none"
          style={{ transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(6px)' }}>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>👁 Spectating</span>
        </div>
      )}

      {/* ── My hand (pinned at bottom) ── */}
      <div className="shrink-0 flex items-end gap-2 px-5 pb-3 pt-1 overflow-x-auto"
        style={{
          height: 148,
          borderTop: overHand ? '2px solid rgba(134,239,172,0.7)' : '1px solid rgba(255,255,255,0.06)',
          background: overHand ? 'rgba(134,239,172,0.06)' : 'rgba(0,0,0,0.3)',
          boxShadow: overHand ? 'inset 0 0 24px rgba(134,239,172,0.08)' : 'none',
          transition: 'border-color 0.12s, background 0.12s',
        }}
        onDragOver={(e) => {
          try {
            const raw = e.dataTransfer.types.includes('application/json');
            if (raw) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverHand(true); }
          } catch { /* */ }
        }}
        onDragLeave={() => setOverHand(false)}
        onDrop={(e) => {
          e.preventDefault(); setOverHand(false);
          try {
            const d: DragData = JSON.parse(e.dataTransfer.getData('application/json'));
            if (d.source === 'battlefield') emit.toHand(d.instanceId);
          } catch { /* */ }
        }}>
        {me.hand.length === 0 ? (
          <p className="text-xs italic self-center w-full text-center" style={{ color: 'rgba(255,255,255,0.08)' }}>
            Hand empty — click Draw to draw a card
          </p>
        ) : (
          me.hand.map((card) => {
            const { playable, reason } = cardTimingStatus(card);
            return (
              <div key={card.instanceId}
                draggable={playable}
                onDragStart={playable ? (e) => dragStart(e, card.instanceId, 'hand') : undefined}
                onClick={() => emit.playCard(card.instanceId)}
                onMouseEnter={() => setHoverCard(card)}
                onMouseLeave={() => setHoverCard(null)}
                className="shrink-0 transition-transform duration-150 origin-bottom relative group/card"
                style={{ width: 100, cursor: playable ? 'grab' : 'not-allowed', opacity: playable ? 1 : 0.45 }}
                onMouseOver={(e) => {
                  if (playable) (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-16px) scale(1.08)';
                }}
                onMouseOut={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0) scale(1)';
                  setHoverCard(null);
                }}
                title={playable ? `${card.name} — drag to battlefield or click to play` : `${card.name} — ${reason}`}>
                {card.imageUri
                  ? <img src={card.imageUri} alt={card.name} className="w-full rounded-xl"
                      style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)' }} />
                  : <CardBack style={{ width: 100, height: 140 }} />}
                {!playable && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/card:block z-20 pointer-events-none"
                    style={{ width: 140 }}>
                    <div className="text-[9px] text-center px-2 py-1 rounded-lg font-medium leading-tight"
                      style={{ background: '#1c0a0a', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5' }}>
                      {reason}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Floating log ── */}
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

      {/* ── Global hover preview ── */}
      {hoverCard && <HoverPreview card={hoverCard} x={mouse.x} y={mouse.y} />}

      {/* ── Zone modals ── */}
      {zoneModal === 'graveyard' && (
        <ZoneModal title="Graveyard" cards={me.graveyard} onClose={() => setZoneModal(null)} actions={[
          { label: '↩ Return to Hand',           color: '#86efac', onCard: (c) => emit.toHand(c.instanceId) },
          { label: '⚡ Return to Battlefield',   color: '#fbbf24', onCard: (c) => emit.returnToBf(c.instanceId) },
          { label: '🪄 Cast (Flashback/Unearth)', color: '#c4b5fd', onCard: (c) => emit.returnToBf(c.instanceId) },
          { label: '✦ Exile',                    color: '#a78bfa', onCard: (c) => emit.toExile(c.instanceId) },
        ]} />
      )}
      {zoneModal === 'exile' && (
        <ZoneModal title="Exile" cards={me.exile} onClose={() => setZoneModal(null)} actions={[
          { label: '↩ Return to Hand',         color: '#86efac', onCard: (c) => emit.toHand(c.instanceId) },
          { label: '⚡ Play from Exile',        color: '#fbbf24', onCard: (c) => emit.returnToBf(c.instanceId) },
          { label: '⚡ Return to Battlefield',  color: '#fbbf24', onCard: (c) => emit.returnToBf(c.instanceId) },
        ]} />
      )}
      {zoneModal === 'library' && (
        <ZoneModal title="Library Search" cards={libraryCards} loading={libraryLoading}
          onClose={closeLibraryModal} actions={[
            { label: '↩ Tutor to Hand',      color: '#86efac', onCard: (c) => emit.tutor(c.instanceId, 'hand') },
            { label: '⚡ Put on Battlefield', color: '#fbbf24', onCard: (c) => emit.tutor(c.instanceId, 'battlefield') },
          ]} />
      )}

      {/* ── Dice result toast ── */}
      {diceResult && (
        <div className="fixed top-16 left-1/2 z-50 flex flex-col items-center gap-1 px-6 py-4 rounded-2xl"
          style={{ transform: 'translateX(-50%)', background: '#0f172a',
            border: '1px solid rgba(251,191,36,0.45)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.85), 0 0 24px rgba(251,191,36,0.15)',
            pointerEvents: 'none' }}>
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            {diceResult.playerName}
          </span>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>rolled a d{diceResult.sides}</span>
          <span style={{ fontSize: 52, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1,
            color: diceResult.result === diceResult.sides ? '#fbbf24' : diceResult.result === 1 ? '#ef4444' : '#f1f5f9',
            textShadow: diceResult.result === diceResult.sides ? '0 0 20px #fbbf24' : diceResult.result === 1 ? '0 0 16px #ef4444' : 'none' }}>
            {diceResult.result}
          </span>
          {diceResult.result === diceResult.sides && (
            <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>NAT {diceResult.sides}! 🎉</span>
          )}
          {diceResult.result === 1 && (
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>Critical fail 💀</span>
          )}
        </div>
      )}

      {/* ── Timing error toast ── */}
      {timingToast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ transform: 'translateX(-50%)', background: '#180808',
            border: '1px solid rgba(239,68,68,0.45)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.85), 0 0 20px rgba(239,68,68,0.1)',
            maxWidth: 440 }}>
          <span className="text-lg shrink-0">⛔</span>
          <span className="text-sm font-medium" style={{ color: '#fca5a5' }}>{timingToast}</span>
          <button onClick={() => setTimingToast(null)}
            className="shrink-0 ml-1 w-5 h-5 flex items-center justify-center rounded transition hover:bg-white/10"
            style={{ color: '#6b7280' }}>×</button>
        </div>
      )}

      {/* ── Defeat announcement overlay ── */}
      {announcement && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 px-10 py-8 rounded-3xl text-center"
            style={{ background: 'rgba(10,0,0,0.92)', border: '2px solid rgba(239,68,68,0.6)',
              boxShadow: '0 0 80px rgba(239,68,68,0.3), 0 40px 80px rgba(0,0,0,0.9)',
              backdropFilter: 'blur(12px)', maxWidth: 480 }}>
            <span style={{ fontSize: 52 }}>💀</span>
            <p className="text-xl font-black" style={{ color: '#fca5a5', lineHeight: 1.3 }}>{announcement}</p>
            <button className="pointer-events-auto text-xs px-4 py-1.5 rounded-lg mt-1 transition hover:bg-white/10"
              style={{ color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}
              onClick={() => setAnnouncement(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Token creation modal ── */}
      {showTokenModal && (
        <TokenCreateModal
          onClose={() => setShowTokenModal(false)}
          onCreate={(name, power, toughness, color, typeLine, oracleText) =>
            emit.createToken(name, power, toughness, color, typeLine, oracleText)
          }
        />
      )}

      {/* ── Mulligan screen ── */}
      {gameState.mulliganPhase && !me.mulliganReady && !scryCards && (
        <MulliganScreen
          hand={me.hand}
          mulliganCount={me.mulliganCount}
          players={gameState.players.map((p) => ({
            socketId: p.socketId, playerName: p.playerName,
            mulliganReady: p.mulliganReady, mulliganCount: p.mulliganCount,
          }))}
          mySocketId={mySocketId}
          onKeep={() => emit.mulliganKeep()}
          onMulligan={() => emit.mulligan()}
        />
      )}

      {/* ── Concede popup ── */}
      {showConcedePopup && (
        <ConcedePopup
          onConfirm={() => { emit.concede(); setShowConcedePopup(false); }}
          onCancel={() => setShowConcedePopup(false)}
        />
      )}

      {/* ── Mill input ── */}
      {millInputOpen && (
        <MillInputPopup
          maxCount={me.libraryCount}
          onConfirm={(n) => emit.mill(n)}
          onClose={() => setMillInputOpen(false)}
        />
      )}

      {/* ── Mill result ── */}
      {millCards && (
        <MillResultModal cards={millCards} onClose={() => setMillCards(null)} />
      )}

      {/* ── Scry input ── */}
      {scryInputOpen && (
        <ScryInputPopup
          maxCount={me.libraryCount}
          onConfirm={(n) => emit.scry(n)}
          onClose={() => setScryInputOpen(false)}
        />
      )}

      {/* ── Scry modal ── */}
      {scryCards && (
        <ScryModal
          cards={scryCards}
          onResolve={(keep, bot) => { emit.scryResolve(keep, bot); setScryCards(null); }}
          onClose={() => setScryCards(null)}
        />
      )}

      {/* ── Death confirmation popup ── */}
      {gameState.pendingElimination && (
        <DeathConfirmationPopup
          pending={gameState.pendingElimination}
          onConfirm={() => emit.confirmElimination(gameState.pendingElimination!.socketId)}
          onCancel={() => emit.cancelElimination()}
        />
      )}

      {/* ── Commander replacement popup ── */}
      {/* ── Keyboard shortcut cheat sheet ── */}
      {showShortcutHelp && (
        <div className="fixed inset-0 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 10000 }}
          onClick={() => setShowShortcutHelp(false)}>
          <div className="rounded-2xl p-5 flex flex-col gap-3"
            style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 40px 80px rgba(0,0,0,0.9)', minWidth: 300 }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-white">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcutHelp(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg transition hover:bg-white/10"
                style={{ color: '#6b7280' }}>×</button>
            </div>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Hover over a card on the battlefield, then press a key.
            </p>
            {([
              ['T', 'Tap / Untap'],
              ['G', 'Send to Graveyard'],
              ['E', 'Exile'],
              ['H', 'Return to Hand'],
              ['C', 'Duplicate / Copy card'],
              ['F', 'Flip Face Down / Face Up'],
              ['+  /  =', 'Add +1/+1 counter'],
              ['−', 'Remove +1/+1 counter'],
              ['Del', 'Send to Graveyard'],
            ] as [string, string][]).map(([key, desc]) => (
              <div key={key} className="flex items-center gap-3">
                <kbd style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 5, padding: '2px 8px', fontSize: 11, fontFamily: 'monospace',
                  color: '#e2e8f0', minWidth: 44, textAlign: 'center', display: 'inline-block' }}>
                  {key}
                </kbd>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {commanderPopup && (
        <CommanderReplacementPopup
          cardName={commanderPopup.cardName}
          destination={commanderPopup.destination}
          onCommandZone={() => { emit.returnCmd(commanderPopup.instanceId); setCommanderPopup(null); }}
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
