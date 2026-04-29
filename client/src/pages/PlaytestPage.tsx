import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { GameCard } from '../lib/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function instCard(proto: Omit<GameCard, 'instanceId' | 'tapped'>): GameCard {
  return { ...proto, instanceId: uid(), tapped: false, counters: proto.counters ?? {} };
}

const KNOWN_KEYWORDS_PT = [
  'Flying', 'Trample', 'Vigilance', 'Deathtouch', 'Lifelink', 'Indestructible',
  'First Strike', 'Double Strike', 'Menace', 'Reach', 'Haste', 'Hexproof', 'Flash',
];

function enrichKeywords(card: GameCard): GameCard {
  const text = (card.oracleText ?? '').toLowerCase();
  if (!text) return card;
  const existing = new Set((card.keywords ?? []).map(k => k.toLowerCase()));
  const extras = KNOWN_KEYWORDS_PT.filter(kw => !existing.has(kw.toLowerCase()) && text.includes(kw.toLowerCase()));
  if (extras.length === 0) return card;
  return { ...card, keywords: [...(card.keywords ?? []), ...extras] };
}

interface SoloState {
  library: GameCard[];
  hand: GameCard[];
  battlefield: GameCard[];
  graveyard: GameCard[];
  exile: GameCard[];
  commandZone: GameCard[];
}
type SoloZone = keyof SoloState;

function buildState(protos: Omit<GameCard, 'instanceId' | 'tapped'>[], drawN = 7): SoloState {
  const commanders = protos.filter(p => p.isCommander).map(p => instCard(p));
  const rest = shuffleArr(protos.filter(p => !p.isCommander).map(p => instCard(p)));
  const n = Math.min(drawN, rest.length);
  return {
    commandZone: commanders,
    library: rest.slice(0, rest.length - n),
    hand: rest.slice(rest.length - n),
    battlefield: [], graveyard: [], exile: [],
  };
}

// ── Mana pool ──────────────────────────────────────────────────────────────────

interface ManaPoolState { W: number; U: number; B: number; R: number; G: number; C: number; any: number; }
const EMPTY_MANA: ManaPoolState = { W:0, U:0, B:0, R:0, G:0, C:0, any:0 };

const MANA_CFG: Record<keyof ManaPoolState, { label: string; bg: string; text: string }> = {
  W:   { label: 'W', bg: '#f0ede0', text: '#44380a' },
  U:   { label: 'U', bg: '#0e68ab', text: '#fff' },
  B:   { label: 'B', bg: '#1a1108', text: '#bbb' },
  R:   { label: 'R', bg: '#d3202a', text: '#fff' },
  G:   { label: 'G', bg: '#00733e', text: '#fff' },
  C:   { label: '◇', bg: '#888',    text: '#fff' },
  any: { label: '◈', bg: '#c9a84c', text: '#000' },
};

function parseManaFromOracle(oracle: string): ManaPoolState {
  const pool: ManaPoolState = { ...EMPTY_MANA };
  if (/add \{C\}\{C\}/i.test(oracle)) pool.C += 2;
  else if (/add \{C\}/i.test(oracle)) pool.C++;
  if (/add one mana of any color/i.test(oracle)) pool.any++;
  for (const line of oracle.split('\n')) {
    if (!/\badd\b/i.test(line) || /any color/i.test(line)) continue;
    for (const m of line.matchAll(/\{([WUBRG])\}/gi))
      (pool[m[1].toUpperCase() as keyof ManaPoolState] as number)++;
  }
  return pool;
}

function ManaPoolTracker({ pool, onAdjust }: { pool: ManaPoolState; onAdjust: (c: keyof ManaPoolState, d: number) => void }) {
  const COLORS = Object.keys(MANA_CFG) as (keyof ManaPoolState)[];
  const bs: React.CSSProperties = {
    width: 14, height: 14, borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0,
    fontSize: 10, background: 'rgba(255,255,255,0.07)', color: '#9ca3af',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
  return (
    <div style={{
      position: 'fixed', bottom: 130, left: '50%', transform: 'translateX(-50%)',
      zIndex: 150, display: 'flex', alignItems: 'center', gap: 3,
      background: 'rgba(6,9,18,0.92)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20,
      padding: '4px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
    }}>
      <span style={{ fontSize: 8, color: '#4b5563', fontWeight: 700, letterSpacing: 0.5, marginRight: 2 }}>MANA</span>
      {COLORS.map(color => {
        const cfg = MANA_CFG[color]; const count = pool[color];
        return (
          <div key={color} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <button style={{ ...bs, opacity: count > 0 ? 1 : 0.4 }} onClick={() => onAdjust(color, -1)}>−</button>
            <div style={{
              background: cfg.bg, color: cfg.text, borderRadius: 10, minWidth: 20, height: 20,
              padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap',
              border: `1px solid rgba(0,0,0,${color === 'W' ? '0.15' : '0.4'})`,
              opacity: count > 0 ? 1 : 0.22,
            }}>{cfg.label}{count > 0 ? count : ''}</div>
            <button style={bs} onClick={() => onAdjust(color, 1)}>+</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Counter system ─────────────────────────────────────────────────────────────

const COUNTER_TYPES = ['+1/+1', '-1/-1', 'loyalty', 'charge', 'time', 'poison'] as const;
const PT_COUNTER_TYPES = ['+1/+0', '+0/+1', '-1/+0', '+0/-1'] as const;
const COUNTER_META: Record<string, { sym: string; label: string; color: string }> = {
  '+1/+1':   { sym: '+1/+1', label: '+1/+1',   color: '#4ade80' },
  '-1/-1':   { sym: '-1/-1', label: '-1/-1',   color: '#f87171' },
  'loyalty': { sym: '⚜',    label: 'Loyalty',  color: '#fbbf24' },
  'charge':  { sym: '⚡',   label: 'Charge',   color: '#93c5fd' },
  'time':    { sym: '⏳',   label: 'Time',     color: '#e2e8f0' },
  'poison':  { sym: '☠',   label: 'Poison',   color: '#d8b4fe' },
  '+1/+0':   { sym: '+1/+0', label: '+1/+0',   color: '#86efac' },
  '+0/+1':   { sym: '+0/+1', label: '+0/+1',   color: '#93c5fd' },
  '-1/+0':   { sym: '-1/+0', label: '-1/+0',   color: '#fca5a5' },
  '+0/-1':   { sym: '+0/-1', label: '+0/-1',   color: '#e9d5ff' },
};

function CounterBadge({ type, count }: { type: string; count: number }) {
  const m = COUNTER_META[type] ?? { sym: type.slice(0, 4), color: '#e2e8f0' };
  return (
    <div style={{
      background: 'rgba(0,0,0,0.88)', color: m.color, borderRadius: 99, padding: '2px 6px',
      fontSize: 11, fontWeight: 800, lineHeight: 1.3,
      border: `1px solid ${m.color}66`, whiteSpace: 'nowrap',
      display: 'flex', alignItems: 'center', gap: 3,
    }}>
      <span>{m.sym}</span><span style={{ color: '#fff' }}>{count}</span>
    </div>
  );
}

// ── Keywords ───────────────────────────────────────────────────────────────────

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

// ── Battlefield layout ─────────────────────────────────────────────────────────

const C_W_BASE = 140, C_H_BASE = 196;
const C_LW_BASE = 112;
const C_HGAP = 4, C_RGAP = 16, C_LBLW = 80;
const CANVAS_W = 3200, CANVAS_H = 1600;

const TYPE_ROWS_SOLO = [
  { label: 'Creatures',     match: (t: string) => t.includes('Creature'),                                                    isLand: false },
  { label: 'Artifacts',     match: (t: string) => !t.includes('Creature') && t.includes('Artifact'),                         isLand: false },
  { label: 'Enchantments',  match: (t: string) => !t.includes('Creature') && !t.includes('Artifact') && t.includes('Enchantment'), isLand: false },
  { label: 'Planeswalkers', match: (t: string) => t.includes('Planeswalker') && !t.includes('Creature'),                     isLand: false },
  { label: 'Other',         match: (t: string) => !t.includes('Land'),                                                       isLand: false },
  { label: 'Lands',         match: (_: string) => true,                                                                      isLand: true  },
];

function groupByType(cards: GameCard[]) {
  const assigned = new Set<string>();
  const rows: { label: string; cards: GameCard[]; isLand: boolean }[] = [];
  for (const { label, match, isLand } of TYPE_ROWS_SOLO) {
    const rc = cards.filter(c => !assigned.has(c.instanceId) && match(c.typeLine ?? ''));
    rc.forEach(c => assigned.add(c.instanceId));
    if (rc.length > 0) rows.push({ label, cards: rc, isLand });
  }
  return rows;
}

interface CSlot { topId: string; groupIds: string[]; x: number; }
interface CRow { label: string; isLand: boolean; y: number; cW: number; cH: number; slots: CSlot[]; }

function buildCRows(cards: GameCard[], zoneW = CANVAS_W - 40, cardBase = C_W_BASE): CRow[] {
  const gap = C_HGAP, rgap = C_RGAP;
  const out: CRow[] = [];
  let ry = 0;
  for (const { label, cards: rc, isLand } of groupByType(cards)) {
    const cW = isLand ? Math.round(cardBase * C_LW_BASE / C_W_BASE) : cardBase;
    const cH = Math.round(cW * C_H_BASE / C_W_BASE);
    const nameMap = new Map<string, GameCard[]>();
    for (const c of rc) {
      const ck = Object.entries(c.counters ?? {}).filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)).map(([k,n])=>`${k}:${n}`).join(',');
      const key = `${c.name}__${ck}__${(c.keywords??[]).slice().sort().join(',')}`;
      const arr = nameMap.get(key) ?? [];
      arr.push(c);
      nameMap.set(key, arr);
    }
    const slots: CSlot[] = [];
    let x = C_LBLW;
    for (const [, group] of nameMap) {
      const untapped = group.filter(c => !c.tapped);
      const tapped   = group.filter(c =>  c.tapped);
      if (untapped.length > 0) { slots.push({ topId: untapped[0].instanceId, groupIds: untapped.map(c=>c.instanceId), x }); x += cW + gap; }
      for (const tc of tapped) { slots.push({ topId: tc.instanceId, groupIds: [tc.instanceId], x }); x += cH + gap; }
    }
    out.push({ label, isLand, y: ry, cW, cH, slots });
    ry += cH + rgap;
  }
  return out;
}

// ── Shared card components ─────────────────────────────────────────────────────

function TappedCardWrapper({ card, cardW, cardH, children, className = '' }: {
  card: GameCard; cardW: number; cardH: number; children: React.ReactNode; className?: string;
}) {
  const w = card.tapped ? cardH : cardW, h = card.tapped ? cardW : cardH;
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: w, height: h, transition: 'width 0.2s, height 0.2s' }}>
      <div style={{
        position: 'absolute', width: cardW, height: cardH,
        top:  card.tapped ? (cardW - cardH) / 2 : 0,
        left: card.tapped ? (cardH - cardW) / 2 : 0,
        transform: card.tapped ? 'rotate(90deg)' : 'none',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        transformOrigin: 'center center',
      }}>{children}</div>
    </div>
  );
}

function sanitizePT(v: string | null | undefined): string { if (!v || v.includes('*')) return '1'; return v; }

function PtBar({ card }: { card: GameCard }) {
  if (card.isToken) return null;
  if (!(card.typeLine ?? '').includes('Creature')) return null;
  function fmt(val: string | null | undefined, delta = 0): number {
    if (!val || val.includes('*')) return Math.max(0, 1 + delta);
    const n = parseInt(val, 10);
    return Math.max(0, (isNaN(n) ? 1 : n) + delta);
  }
  const p1 = card.counters?.['+1/+1'] ?? 0, m1 = card.counters?.['-1/-1'] ?? 0, base = p1 - m1;
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
      background: 'rgba(0,0,0,0.95)', borderRadius: '0 0 6px 6px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 2, zIndex: 25, pointerEvents: 'none', fontSize: 14, fontWeight: 800, color: '#f1f5f9',
    }}>
      <span style={{ fontSize: 11 }}>⚔</span>
      <span>{fmt(card.power, base + (card.counters?.['+1/+0']??0) - (card.counters?.['-1/+0']??0))}</span>
      <span style={{ opacity: 0.35, fontSize: 12 }}>/</span>
      <span style={{ fontSize: 11 }}>🛡</span>
      <span>{fmt(card.toughness, base + (card.counters?.['+0/+1']??0) - (card.counters?.['+0/-1']??0))}</span>
    </div>
  );
}

function TokenPtOverlay({ card }: { card: GameCard }) {
  if (!card.isToken || !(card.typeLine ?? '').includes('Creature')) return null;
  const basePow = card.powerOverride ?? card.power ?? null;
  const baseTou = card.toughnessOverride ?? card.toughness ?? null;
  if (basePow === null && baseTou === null) return null;
  const pp = (card.counters?.['+1/+1']??0) - (card.counters?.['-1/-1']??0);
  const fmt = (b: string | null) => { const n = parseInt(sanitizePT(b), 10); return String(Math.max(0, (isNaN(n)?1:n) + pp)); };
  return (
    <div style={{
      position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, pointerEvents: 'none',
      background: 'rgba(0,0,0,0.82)', borderRadius: 8, padding: '2px 10px',
      fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 0.5, whiteSpace: 'nowrap',
    }}>{fmt(basePow)}/{fmt(baseTou)}</div>
  );
}

function NonCreatureTokenOverlay({ card }: { card: GameCard }) {
  if (!(card.isToken || (card.typeLine??'').includes('Token'))) return null;
  if ((card.typeLine??'').includes('Creature')) return null;
  const qty = card.counters?.['quantity'] ?? 0;
  if (qty === 0) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, pointerEvents: 'none',
      background: 'rgba(0,0,0,0.82)', borderRadius: 12, padding: '4px 14px',
      fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: 0.5, whiteSpace: 'nowrap',
    }}>{qty}</div>
  );
}

function HoverPreview({ card, x, y }: { card: GameCard; x: number; y: number }) {
  if (!card.imageUri) return null;
  const W = 240, H = 336;
  const left = x + W + 24 > window.innerWidth ? x - W - 12 : x + 16;
  const top  = Math.max(8, Math.min(y - 80, window.innerHeight - H - 8));
  return (
    <div style={{ position: 'fixed', left, top, width: W, zIndex: 9999, pointerEvents: 'none' }}>
      <img src={card.imageUri} alt={card.name} style={{ width: '100%', borderRadius: 16,
        border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 30px 60px rgba(0,0,0,0.8)' }} />
      <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 4, fontWeight: 500 }}>{card.name}</p>
    </div>
  );
}

// ── Canvas pile zone (graveyard / exile drop targets) ──────────────────────────

interface DragData { instanceId: string; source: 'hand' | 'battlefield' | 'commandZone' }

function CanvasPileZone({ cards, icon, label, color, bgColor, isOver, onDragOver, onDragLeave, onDrop, onClick, onHover, onHoverEnd }: {
  cards: GameCard[]; icon: string; label: string; color: string; bgColor: string; isOver: boolean;
  onDragOver: () => void; onDragLeave: () => void; onDrop: (d: DragData) => void;
  onClick: () => void; onHover: (c: GameCard) => void; onHoverEnd: () => void;
}) {
  const top = cards[cards.length - 1];
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
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); try { onDrop(JSON.parse(e.dataTransfer.getData('application/json'))); } catch { /**/ } }}
      onMouseDown={(e) => e.stopPropagation()}>
      {top?.imageUri && (
        <img src={top.imageUri} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
          onMouseEnter={() => onHover(top)} onMouseLeave={onHoverEnd} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 30%, rgba(0,0,0,0.1) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, pointerEvents: 'none' }}>
        {!top && <span style={{ fontSize: 32, opacity: 0.45 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: `${color}dd`, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{label.toUpperCase()}</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>drag cards here</span>
      </div>
      <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.88)', borderRadius: 6, padding: '2px 7px', border: `1px solid ${color}70` }}>
        <span style={{ fontSize: 13, fontWeight: 900, color, fontFamily: 'monospace' }}>{cards.length}</span>
      </div>
    </div>
  );
}

// ── Zone viewer modal ──────────────────────────────────────────────────────────

function ZoneModal({ title, cards, onClose, actions }: {
  title: string; cards: GameCard[]; onClose: () => void;
  actions: { label: string; color?: string; onCard: (c: GameCard) => void }[];
}) {
  const [search, setSearch] = useState('');
  const filtered = cards.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="flex flex-col rounded-2xl overflow-hidden"
        style={{ width: '82vw', maxWidth: 960, maxHeight: '88vh', background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 80px rgba(0,0,0,0.9)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-4 px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-lg font-bold text-white flex-1">{title}
            <span className="text-sm font-normal ml-2" style={{ color: '#6b7280' }}>({cards.length})</span>
          </h2>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…" autoFocus
            className="text-sm px-3 py-1.5 rounded-lg focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', width: 160 }} />
          <button onClick={onClose} style={{ fontSize: 20, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {filtered.length === 0
            ? <p className="text-center py-16 text-sm" style={{ color: '#374151' }}>{search ? `No matches for "${search}"` : 'Empty'}</p>
            : <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                {filtered.map(card => (
                  <div key={card.instanceId} className="flex flex-col gap-2">
                    <div className="relative rounded-xl overflow-hidden" style={{ paddingBottom: '140%' }}>
                      {card.imageUri
                        ? <img src={card.imageUri} alt={card.name} className="absolute inset-0 w-full h-full object-cover" />
                        : <div className="absolute inset-0 flex items-center justify-center p-2" style={{ background: '#1e293b', border: '1px solid #334155' }}>
                            <span className="text-xs text-center" style={{ color: '#64748b' }}>{card.name}</span>
                          </div>}
                    </div>
                    <p className="text-xs font-medium truncate" style={{ color: '#cbd5e1' }}>{card.name}</p>
                    <div className="flex flex-col gap-1">
                      {actions.map(a => (
                        <button key={a.label} onClick={() => { a.onCard(card); onClose(); }}
                          className="text-xs py-1 px-2 rounded-lg text-left font-medium"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: a.color ?? '#9ca3af' }}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>}
        </div>
      </div>
    </div>
  );
}

// ── Token creation ─────────────────────────────────────────────────────────────

function wrapSvgText(text: string, max: number): string[] {
  const words = text.split(' '); const lines: string[] = []; let cur = '';
  for (const w of words) { const next = cur ? `${cur} ${w}` : w; if (next.length <= max) { cur = next; } else { if (cur) lines.push(cur); cur = w; } }
  if (cur) lines.push(cur); return lines;
}

function makeTokenSvg(name: string, pt: string, colors: string[], oracle = ''): string {
  const BG: Record<string, string> = { white: '#cfc08a', blue: '#1c3d6b', black: '#1a1228', red: '#6b1c1c', green: '#1c4a2a', colorless: '#3a3a4a' };
  const BD: Record<string, string> = { white: '#a89850', blue: '#4a7ec4', black: '#7a4ab4', red: '#c44a4a', green: '#4a9a5a', colorless: '#7a7a8a' };
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let defs = '', bgFill: string;
  if (colors.length <= 1) { bgFill = BG[colors[0]] ?? BG.colorless; }
  else { const stops = colors.map((c,i)=>`<stop offset="${Math.round(i/(colors.length-1)*100)}%" stop-color="${BG[c]??BG.colorless}"/>`).join(''); defs=`<defs><linearGradient id="tbg" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>`; bgFill='url(#tbg)'; }
  const bdC = colors.length === 1 ? (BD[colors[0]]??BD.colorless) : '#c8a84b';
  const hasNoPt = !pt || pt === '/';
  let body = '';
  if (hasNoPt && oracle) { body = wrapSvgText(oracle,26).slice(0,9).map((l,i)=>`<text x="100" y="${132+i*13}" font-family="Georgia,serif" font-size="8" fill="rgba(255,255,255,0.82)" text-anchor="middle">${esc(l)}</text>`).join(''); }
  else if (!hasNoPt) { body = `<rect x="55" y="168" width="90" height="38" rx="6" fill="rgba(0,0,0,0.45)" stroke="${bdC}" stroke-width="1"/><text x="100" y="194" font-family="Georgia,serif" font-size="22" fill="white" text-anchor="middle" font-weight="bold">${esc(pt)}</text>`; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280">${defs}<rect width="200" height="280" rx="10" fill="${bgFill}" stroke="${bdC}" stroke-width="3"/><rect x="8" y="8" width="184" height="264" rx="7" fill="none" stroke="${bdC}" stroke-width="1" opacity="0.5"/><text x="100" y="108" font-family="Georgia,serif" font-size="13" fill="white" text-anchor="middle" font-weight="bold">${esc(name)}</text>${body}<text x="100" y="262" font-family="Georgia,serif" font-size="9" fill="rgba(255,255,255,0.35)" text-anchor="middle">TOKEN</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type TokenColor = 'white' | 'blue' | 'black' | 'red' | 'green' | 'colorless';
const COLOR_SWATCHES: Record<TokenColor, string> = { white: '#cfc08a', blue: '#4a7eb5', black: '#7a4ab4', red: '#c44a4a', green: '#4a9a5a', colorless: '#7a7a8a' };

const TOKEN_PRESETS: { name: string; power: string; toughness: string; colors: TokenColor[]; typeLine: string; oracle?: string }[] = [
  { name: 'Saproling',  power:'1', toughness:'1', colors:['green'],     typeLine:'Token Creature — Saproling' },
  { name: 'Beast',      power:'3', toughness:'3', colors:['green'],     typeLine:'Token Creature — Beast' },
  { name: 'Elemental',  power:'4', toughness:'4', colors:['green'],     typeLine:'Token Creature — Elemental' },
  { name: 'Soldier',    power:'1', toughness:'1', colors:['white'],     typeLine:'Token Creature — Soldier' },
  { name: 'Spirit',     power:'1', toughness:'1', colors:['white'],     typeLine:'Token Creature — Spirit (Flying)' },
  { name: 'Angel',      power:'3', toughness:'3', colors:['white'],     typeLine:'Token Creature — Angel (Flying, Vigilance)' },
  { name: 'Zombie',     power:'2', toughness:'2', colors:['black'],     typeLine:'Token Creature — Zombie' },
  { name: 'Goblin',     power:'1', toughness:'1', colors:['red'],       typeLine:'Token Creature — Goblin' },
  { name: 'Dragon',     power:'4', toughness:'4', colors:['red'],       typeLine:'Token Creature — Dragon (Flying)' },
  { name: 'Bird',       power:'1', toughness:'1', colors:['blue'],      typeLine:'Token Creature — Bird (Flying)' },
  { name: 'Thopter',    power:'1', toughness:'1', colors:['colorless'], typeLine:'Token Artifact Creature — Thopter (Flying)' },
  { name: 'Treasure',   power:'',  toughness:'',  colors:['colorless'], typeLine:'Artifact — Treasure', oracle:'T, Sacrifice: Add one mana of any color.' },
  { name: 'Clue',       power:'',  toughness:'',  colors:['colorless'], typeLine:'Artifact — Clue',     oracle:'2, Sacrifice: Draw a card.' },
  { name: 'Food',       power:'',  toughness:'',  colors:['colorless'], typeLine:'Artifact — Food',     oracle:'2, T, Sacrifice: Gain 3 life.' },
];

function TokenModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (card: Omit<GameCard, 'instanceId' | 'tapped'>) => void;
}) {
  const [name, setName] = useState('');
  const [power, setPower] = useState('1');
  const [toughness, setToughness] = useState('1');
  const [colors, setColors] = useState<TokenColor[]>(['green']);
  const [typeLine, setTypeLine] = useState('Token Creature');
  const [oracle, setOracle] = useState('');
  const [qty, setQty] = useState(1);

  function applyPreset(p: typeof TOKEN_PRESETS[0]) {
    setName(p.name); setPower(p.power); setToughness(p.toughness);
    setColors(p.colors); setTypeLine(p.typeLine); setOracle(p.oracle ?? '');
  }
  function toggleColor(c: TokenColor) {
    setColors(prev => prev.includes(c) ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c]);
  }

  const isCreature = typeLine.includes('Creature');
  const pt = isCreature ? `${power}/${toughness}` : '';

  function handleCreate() {
    if (!name) return;
    const imageUri = makeTokenSvg(name, pt, colors, oracle);
    for (let i = 0; i < qty; i++) {
      onCreate({
        scryfallId: `token-${uid()}`, name, imageUri, typeLine, oracleText: oracle,
        power: power || undefined, toughness: toughness || undefined,
        basePower: parseInt(power, 10) || 0, baseToughness: parseInt(toughness, 10) || 0,
        isToken: true, counters: { quantity: qty > 1 ? 1 : 0 },
      });
    }
    onClose();
  }

  const inp: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontSize: 12 };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 10000 }} onClick={onClose}>
      <div className="rounded-2xl p-5 flex flex-col gap-3 overflow-y-auto"
        style={{ width: 380, maxHeight: '90vh', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 40px 80px rgba(0,0,0,0.9)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Create Token</h2>
          <button onClick={onClose} style={{ fontSize: 20, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TOKEN_PRESETS.map((p, i) => (
            <button key={i} onClick={() => applyPreset(p)} className="text-xs px-2 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db', whiteSpace: 'nowrap' }}>
              {p.power ? `${p.power}/${p.toughness} ` : ''}{p.name}
            </button>
          ))}
        </div>

        <hr style={{ borderColor: 'rgba(255,255,255,0.08)' }} />

        <input value={name} onChange={e => setName(e.target.value)} placeholder="Token name" style={{ ...inp, width: '100%' }} />
        <input value={typeLine} onChange={e => setTypeLine(e.target.value)} placeholder="Type line" style={{ ...inp, width: '100%' }} />
        <textarea value={oracle} onChange={e => setOracle(e.target.value)} placeholder="Oracle text (optional)" rows={2}
          style={{ ...inp, width: '100%', resize: 'vertical' }} />

        {isCreature && (
          <div className="flex gap-2">
            <input value={power} onChange={e => setPower(e.target.value)} placeholder="Power" style={{ ...inp, flex: 1 }} />
            <input value={toughness} onChange={e => setToughness(e.target.value)} placeholder="Toughness" style={{ ...inp, flex: 1 }} />
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700 }}>COLOR:</span>
          {(Object.keys(COLOR_SWATCHES) as TokenColor[]).map(c => (
            <button key={c} onClick={() => toggleColor(c)} style={{
              width: 22, height: 22, borderRadius: '50%', background: COLOR_SWATCHES[c], cursor: 'pointer',
              border: colors.includes(c) ? '2px solid #fff' : '2px solid transparent',
              opacity: colors.includes(c) ? 1 : 0.4, transition: 'all 0.15s',
            }} title={c} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700 }}>QTY:</span>
          <button onClick={() => setQty(q => Math.max(1, q-1))} style={{ ...inp, padding: '4px 8px', cursor: 'pointer' }}>−</button>
          <span style={{ color: '#e5e7eb', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{qty}</span>
          <button onClick={() => setQty(q => Math.min(20, q+1))} style={{ ...inp, padding: '4px 8px', cursor: 'pointer' }}>+</button>
        </div>

        <button onClick={handleCreate} disabled={!name}
          style={{ padding: '10px 0', borderRadius: 10, background: name ? '#1d4ed8' : '#1e293b', border: 'none',
            color: name ? '#fff' : '#4b5563', fontWeight: 700, fontSize: 13, cursor: name ? 'pointer' : 'default' }}>
          Create {qty > 1 ? `${qty}×` : ''} {name || 'Token'}
        </button>
      </div>
    </div>
  );
}

// ── Local battlefield card (no opponents/socket) ───────────────────────────────

function LocalTokenCard({ card, cardW, cardH, onTap, onDragStart, onHover, onHoverEnd, onUpdateCounter, onGraveyard, onExile, onReturnHand }: {
  card: GameCard; cardW: number; cardH: number;
  onTap: () => void; onDragStart: (e: React.DragEvent) => void;
  onHover: (c: GameCard) => void; onHoverEnd: () => void;
  onUpdateCounter: (counter: string, delta: number) => void;
  onGraveyard: () => void; onExile: () => void; onReturnHand: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCreature = (card.typeLine ?? '').includes('Creature');
  const counters = card.counters ?? {};
  const basePow = card.basePower ?? (parseInt(card.power ?? '0', 10) || 0);
  const baseTou = card.baseToughness ?? (parseInt(card.toughness ?? '1', 10) || 1);
  const p1 = counters['+1/+1']??0, m1 = counters['-1/-1']??0, base = p1 - m1;
  const displayP = basePow + base + (counters['+1/+0']??0) - (counters['-1/+0']??0);
  const displayT = baseTou + base + (counters['+0/+1']??0) - (counters['+0/-1']??0);
  const qty = counters['quantity'] ?? 1;
  const pillStyle: React.CSSProperties = {
    position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.88)', borderRadius: 10, padding: '3px 12px',
    fontSize: 17, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
  };

  return (
    <TappedCardWrapper card={card} cardW={cardW} cardH={cardH} className="group">
      <div draggable onDragStart={onDragStart} onClick={onTap}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); onHoverEnd(); }}
        onMouseEnter={() => onHover(card)} onMouseLeave={onHoverEnd}
        className="w-full h-full relative"
        style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
          border: card.tapped ? '2px solid rgba(250,204,21,0.6)' : '1px solid rgba(255,255,255,0.15)',
          boxShadow: card.tapped ? '0 0 12px rgba(250,204,21,0.4)' : '0 4px 12px rgba(0,0,0,0.7)' }}>
        {card.imageUri
          ? <img src={card.imageUri} alt={card.name} style={{ width:'100%', height:'100%', objectFit:'cover', opacity: card.tapped ? 0.8 : 1 }} />
          : <div style={{ width:'100%', height:'100%', background:'#1e293b', display:'flex', alignItems:'center', justifyContent:'center', padding:4 }}>
              <span style={{ fontSize:9, color:'#6b7280', textAlign:'center' }}>{card.name}</span>
            </div>}
        {isCreature ? (
          <>
            {Object.values(counters).some(n=>n>0) && (
              <div style={{ position:'absolute', top:3, left:3, display:'flex', flexDirection:'column', gap:2, zIndex:15, pointerEvents:'none' }}>
                {Object.entries(counters).filter(([,n])=>n>0).map(([t,n]) => <CounterBadge key={t} type={t} count={n} />)}
              </div>
            )}
            <div style={pillStyle}>{displayP}/{displayT}</div>
          </>
        ) : (
          <>
            {qty > 0 && <div style={pillStyle}>{qty}</div>}
            <div className="absolute inset-x-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity z-20"
              style={{ display:'flex', justifyContent:'space-around', alignItems:'center', paddingBottom:4, paddingTop:24,
                background:'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}>
              <button onClick={e=>{e.stopPropagation(); onUpdateCounter('quantity',-1);}}
                style={{ width:22, height:22, borderRadius:'50%', background:'#7f1d1d', border:'1px solid #ef4444', color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
              <button onClick={e=>{e.stopPropagation(); onUpdateCounter('quantity',1);}}
                style={{ width:22, height:22, borderRadius:'50%', background:'#14532d', border:'1px solid #4ade80', color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            </div>
          </>
        )}
      </div>
      <button className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition z-20"
        style={{ background:'#374151', border:'1px solid #4b5563', color:'#d1d5db' }}
        onClick={e=>{e.stopPropagation(); setMenuOpen(true);}}>⋮</button>
      {menuOpen && ReactDOM.createPortal(
        <div style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center' }}
          onMouseDown={() => setMenuOpen(false)}>
          <div style={{ width:260, background:'#0f172a', border:'1px solid #334155', borderRadius:16, overflow:'hidden', boxShadow:'0 32px 64px rgba(0,0,0,0.95)' }}
            onMouseDown={e=>e.stopPropagation()}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid #1e293b' }}>
              <span style={{ fontSize:15, color:'#f1f5f9', fontWeight:700 }}>{card.name}</span>
            </div>
            {([
              { label: card.tapped ? '↺ Untap' : '↻ Tap', action: ()=>{onTap(); setMenuOpen(false);}, color:'#f1f5f9' },
              { label: '✋ Return to Hand', action:()=>{onReturnHand(); setMenuOpen(false);}, color:'#86efac' },
              { label: '🪦 Send to Graveyard', action:()=>{onGraveyard(); setMenuOpen(false);}, color:'#94a3b8' },
              { label: '↗ Exile', action:()=>{onExile(); setMenuOpen(false);}, color:'#c4b5fd' },
              ...(isCreature ? [
                { label: '+ +1/+1', action:()=>{onUpdateCounter('+1/+1',1); setMenuOpen(false);}, color:'#4ade80' },
                { label: '− +1/+1', action:()=>{onUpdateCounter('+1/+1',-1); setMenuOpen(false);}, color:'#f87171' },
              ] : []),
            ] as {label:string; action:()=>void; color:string}[]).map(({label,action,color}) => (
              <button key={label} onClick={action}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 18px', fontSize:13, fontWeight:500, color, background:'none', border:'none', cursor:'pointer' }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')}
                onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                {label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </TappedCardWrapper>
  );
}

function LocalBfCard({ card, cardW = 140, cardH = 196, onTap, onGraveyard, onExile, onReturnHand, onReturnCommander, onDragStart, onHover, onHoverEnd, onUpdateCounter, onSetKeywords }: {
  card: GameCard; cardW?: number; cardH?: number;
  onTap: () => void; onGraveyard: () => void; onExile: () => void;
  onReturnHand: () => void; onReturnCommander: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onHover: (c: GameCard) => void; onHoverEnd: () => void;
  onUpdateCounter: (counter: string, delta: number) => void;
  onSetKeywords: (kws: string[]) => void;
}) {
  const [menuMode, setMenuMode] = useState<null | 'main'>(null);
  const counters = card.counters ?? {};
  const hasCounters = Object.values(counters).some(n => n > 0);

  if (card.isToken) {
    return (
      <LocalTokenCard card={card} cardW={cardW} cardH={cardH}
        onTap={onTap} onDragStart={onDragStart} onHover={onHover} onHoverEnd={onHoverEnd}
        onUpdateCounter={onUpdateCounter} onGraveyard={onGraveyard} onExile={onExile} onReturnHand={onReturnHand} />
    );
  }

  return (
    <TappedCardWrapper card={card} cardW={cardW} cardH={cardH} className="group">
      <div draggable
        onDragStart={e => { onDragStart(e); setMenuMode(null); }}
        onClick={onTap}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenuMode('main'); onHoverEnd(); }}
        onMouseEnter={() => { if (!menuMode) onHover(card); }} onMouseLeave={onHoverEnd}
        className="w-full h-full" style={{ cursor: card.tapped ? 'pointer' : 'grab' }}>
        {card.faceDown ? (
          <div className="w-full h-full rounded-lg flex flex-col items-center justify-center gap-1"
            style={{ background:'linear-gradient(135deg,#1e1b4b,#0f172a)', border:card.tapped?'1.5px solid rgba(250,204,21,0.45)':'1.5px solid rgba(99,102,241,0.4)' }}>
            <span style={{ fontSize:22, opacity:0.3 }}>🂠</span>
          </div>
        ) : card.imageUri ? (
          <img src={card.imageUri} alt={card.name} className="w-full h-full object-cover rounded-lg"
            style={{ boxShadow: card.tapped?'0 0 10px rgba(250,204,21,0.4)':'0 4px 10px rgba(0,0,0,0.6)',
              border: card.tapped?'1.5px solid rgba(250,204,21,0.5)':'1px solid rgba(255,255,255,0.1)',
              opacity: card.tapped ? 0.82 : 1 }} />
        ) : (
          <div className="w-full h-full rounded-lg flex items-center justify-center p-1" style={{ background:'#1f2937', border:'1px solid #374151' }}>
            <span className="text-[9px] text-center leading-tight" style={{ color:'#6b7280' }}>{card.name}</span>
          </div>
        )}
      </div>

      {/* Keyword + counter badges */}
      {((card.keywords??[]).length > 0 || hasCounters) && (
        <div style={{ position:'absolute', top:3, left:3, display:'flex', flexDirection:'column', gap:2, zIndex:15, pointerEvents:'none', maxWidth:'75%' }}>
          {(card.keywords??[]).length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:2 }}>
              {(card.keywords??[]).map(kw => (
                <span key={kw} style={{ background:`${KEYWORD_COLOR[kw]??'#64748b'}33`, border:`1px solid ${KEYWORD_COLOR[kw]??'#64748b'}88`, color:KEYWORD_COLOR[kw]??'#e2e8f0', borderRadius:3, padding:'1px 3px', fontSize:8, fontWeight:800 }}>
                  {KEYWORD_ABBR[kw] ?? kw.slice(0,3).toUpperCase()}
                </span>
              ))}
            </div>
          )}
          {hasCounters && Object.entries(counters).filter(([,n])=>n>0).map(([t,n]) => <CounterBadge key={t} type={t} count={n} />)}
        </div>
      )}
      <PtBar card={card} />
      <button
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition z-20"
        style={{ background:'#374151', border:'1px solid #4b5563', color:'#d1d5db' }}
        onClick={e => { e.stopPropagation(); setMenuMode('main'); }}>⋮</button>

      {menuMode !== null && ReactDOM.createPortal(
        <div style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center' }}
          onMouseDown={() => setMenuMode(null)}>
          <div className="rounded-2xl" style={{ width:320, maxHeight:'80vh', overflowY:'auto', background:'#0f172a', border:'1px solid #334155', boxShadow:'0 32px 64px rgba(0,0,0,0.95)' }}
            onMouseDown={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', padding:'14px 12px 14px 18px', borderBottom:'1px solid #1e293b' }}>
              <span style={{ fontSize:16, color:'#f1f5f9', fontWeight:700, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{card.name.split(',')[0]}</span>
              <button onClick={() => setMenuMode(null)} style={{ width:30, height:30, borderRadius:8, background:'#1e293b', border:'1px solid #334155', color:'#94a3b8', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            {/* Actions */}
            <div style={{ padding:'6px 0', borderBottom:'1px solid #1e293b' }}>
              {([
                { label: card.tapped ? '↺ Untap' : '↻ Tap',  action:()=>{onTap(); setMenuMode(null);},           color:'#f1f5f9' },
                { label: '→ Send to Graveyard',               action:()=>{onGraveyard(); setMenuMode(null);},     color:'#94a3b8' },
                { label: '→ Send to Exile',                   action:()=>{onExile(); setMenuMode(null);},         color:'#c4b5fd' },
                { label: '↩ Return to Hand',                  action:()=>{onReturnHand(); setMenuMode(null);},    color:'#86efac' },
                ...(card.isCommander ? [{ label:'⚜ Return to Command Zone', action:()=>{onReturnCommander(); setMenuMode(null);}, color:'#fbbf24' }] : []),
              ] as {label:string; action:()=>void; color:string}[]).map(({label,action,color}) => (
                <button key={label} onClick={action} style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 18px', fontSize:14, fontWeight:500, color, background:'none', border:'none', cursor:'pointer' }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  {label}
                </button>
              ))}
            </div>

            {/* Counters */}
            <div style={{ padding:'6px 0' }}>
              <p style={{ fontSize:11, color:'#64748b', padding:'6px 18px 6px', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase' }}>Counters</p>
              {COUNTER_TYPES.map(type => {
                const m = COUNTER_META[type]; const n = counters[type] ?? 0;
                const bs: React.CSSProperties = { width:28, height:28, borderRadius:7, background:'#1e293b', border:'1px solid #334155', color:'#cbd5e1', fontSize:18, lineHeight:1, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' };
                return (
                  <div key={type} style={{ display:'flex', alignItems:'center', padding:'5px 12px 5px 18px', gap:10 }}>
                    <span style={{ fontSize:14, color:m.color, fontWeight:700, flex:1 }}>{m.label}</span>
                    <button onClick={() => onUpdateCounter(type, -1)} style={bs}>−</button>
                    <span style={{ fontSize:15, fontWeight:800, color:n>0?m.color:'#475569', minWidth:26, textAlign:'center' }}>{n}</span>
                    <button onClick={() => onUpdateCounter(type, 1)} style={bs}>+</button>
                  </div>
                );
              })}
              {(card.typeLine ?? '').includes('Creature') && (
                <>
                  <p style={{ fontSize:11, color:'#64748b', padding:'8px 18px 4px', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase' }}>P/T Only</p>
                  {PT_COUNTER_TYPES.map(type => {
                    const m = COUNTER_META[type]; const n = counters[type] ?? 0;
                    const bs: React.CSSProperties = { width:28, height:28, borderRadius:7, background:'#1e293b', border:'1px solid #334155', color:'#cbd5e1', fontSize:18, lineHeight:1, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' };
                    return (
                      <div key={type} style={{ display:'flex', alignItems:'center', padding:'5px 12px 5px 18px', gap:10 }}>
                        <span style={{ fontSize:14, color:m.color, fontWeight:700, flex:1 }}>{m.label}</span>
                        <button onClick={() => onUpdateCounter(type, -1)} style={bs}>−</button>
                        <span style={{ fontSize:15, fontWeight:800, color:n>0?m.color:'#475569', minWidth:26, textAlign:'center' }}>{n}</span>
                        <button onClick={() => onUpdateCounter(type, 1)} style={bs}>+</button>
                      </div>
                    );
                  })}
                </>
              )}
              {hasCounters && (
                <button onClick={() => { Object.keys(counters).forEach(t => onUpdateCounter(t, -(counters[t]??0))); }}
                  style={{ display:'block', width:'100%', textAlign:'left', padding:'8px 18px', fontSize:13, color:'#f87171', background:'none', border:'none', cursor:'pointer', marginTop:2 }}
                  onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}>
                  × Clear all counters
                </button>
              )}
            </div>

            {/* Keywords */}
            <div style={{ padding:'6px 0', borderTop:'1px solid #1e293b' }}>
              <p style={{ fontSize:11, color:'#64748b', padding:'6px 18px 8px', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase' }}>Keywords</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'0 18px 8px' }}>
                {KEYWORD_LIST.map(kw => {
                  const active = (card.keywords ?? []).includes(kw);
                  return (
                    <button key={kw} onClick={() => onSetKeywords(active ? (card.keywords??[]).filter(k=>k!==kw) : [...(card.keywords??[]), kw])}
                      style={{ padding:'3px 7px', borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer',
                        background: active ? `${KEYWORD_COLOR[kw]}33` : 'rgba(255,255,255,0.04)',
                        border: active ? `1px solid ${KEYWORD_COLOR[kw]}88` : '1px solid rgba(255,255,255,0.1)',
                        color: active ? KEYWORD_COLOR[kw] : '#475569' }}>
                      {KEYWORD_ABBR[kw]} <span style={{ opacity:0.6, fontSize:9 }}>{kw}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </TappedCardWrapper>
  );
}

// ── Solo Canvas ────────────────────────────────────────────────────────────────

interface SoloCanvasProps {
  battlefield: GameCard[];
  commandZone: GameCard[];
  graveyard: GameCard[];
  exile: GameCard[];
  onTap: (id: string) => void;
  onGraveyard: (id: string) => void;
  onExile: (id: string) => void;
  onReturnHand: (id: string) => void;
  onReturnCommander: (id: string) => void;
  onUpdateCounter: (id: string, counter: string, delta: number) => void;
  onSetKeywords: (id: string, kws: string[]) => void;
  onPlayFromHand: (id: string) => void;
  onOpenGy: () => void;
  onOpenEx: () => void;
  onHover: (c: GameCard) => void;
  onHoverEnd: () => void;
}

function SoloCanvas({
  battlefield, commandZone, graveyard, exile,
  onTap, onGraveyard, onExile, onReturnHand, onReturnCommander,
  onUpdateCounter, onSetKeywords, onPlayFromHand,
  onOpenGy, onOpenEx, onHover, onHoverEnd,
}: SoloCanvasProps) {
  const [zoom, setZoom]     = useState(0.7);
  const [pan,  setPan]      = useState({ x: 0, y: 0 });
  const [cardSize, setCardSize] = useState(140);
  const [overBf, setOverBf] = useState(false);
  const [overGy, setOverGy] = useState(false);
  const [overEx, setOverEx] = useState(false);
  const [stackPopover, setStackPopover] = useState<{ groupIds: string[]; canvasX: number; canvasY: number; cW: number; cH: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const camRef      = useRef({ zoom: 0.7, pan: { x: 0, y: 0 } });
  camRef.current = { zoom, pan };

  const cardW = cardSize;
  const cardH = Math.round(cardSize * C_H_BASE / C_W_BASE);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const z = 0.7;
    setPan({ x: rect.width * 0.1, y: rect.height * 0.1 });
    setZoom(z);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom: z, pan: p } = camRef.current;
      if (!e.ctrlKey && !e.metaKey) {
        const rect = el.getBoundingClientRect();
        const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.005);
        const nz = Math.max(0.3, Math.min(2.0, z * factor));
        const s  = nz / z;
        setPan({ x: ox - s*(ox-p.x), y: oy - s*(oy-p.y) });
        setZoom(nz);
      } else {
        setPan({ x: p.x - e.deltaX, y: p.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onBgDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    setStackPopover(null);
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const p0 = { ...camRef.current.pan };
    const m0 = { x: e.clientX, y: e.clientY };
    el.style.cursor = 'grabbing';
    const mv = (ev: MouseEvent) => setPan({ x: p0.x + ev.clientX - m0.x, y: p0.y + ev.clientY - m0.y });
    const up = () => { el.style.cursor = 'grab'; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  }

  const rows    = buildCRows(battlefield, CANVAS_W - 40, cardSize);
  const cardMap = new Map<string, GameCard>(battlefield.map(c => [c.instanceId, c]));

  function makeDrag(id: string, source: DragData['source']) {
    return (e: React.DragEvent) => {
      e.dataTransfer.setData('application/json', JSON.stringify({ instanceId: id, source }));
      e.dataTransfer.effectAllowed = 'move';
    };
  }

  // Command zone rendering (top-left of canvas)
  const CMD_X = 20, CMD_Y = 20, CMD_W = 180;

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden"
      style={{ cursor: 'grab', userSelect: 'none', background: `radial-gradient(ellipse at 50% 0%, rgba(25,80,50,0.9) 0%, transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.7) 0%, transparent 55%), #0e2818` }}
      onMouseDown={onBgDown}>

      <div style={{ position:'absolute', top:0, left:0, width:CANVAS_W, height:CANVAS_H,
        transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin:'0 0' }}>

        {/* Command Zone */}
        {commandZone.length > 0 && (
          <div style={{ position:'absolute', left:CMD_X, top:CMD_Y, width:CMD_W, zIndex:5 }}
            onMouseDown={e => e.stopPropagation()}>
            <p style={{ fontSize:9, fontWeight:800, color:'rgba(250,204,21,0.7)', letterSpacing:1.5, textTransform:'uppercase', marginBottom:8 }}>⚜ Command Zone</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {commandZone.map(card => (
                <div key={card.instanceId} style={{ position:'relative' }}>
                  <LocalBfCard card={card} cardW={cardH*0.72|0} cardH={cardW*0.72|0}
                    onTap={() => onTap(card.instanceId)}
                    onGraveyard={() => onGraveyard(card.instanceId)}
                    onExile={() => onExile(card.instanceId)}
                    onReturnHand={() => onReturnHand(card.instanceId)}
                    onReturnCommander={() => onReturnCommander(card.instanceId)}
                    onDragStart={makeDrag(card.instanceId, 'commandZone')}
                    onHover={onHover} onHoverEnd={onHoverEnd}
                    onUpdateCounter={(c, d) => onUpdateCounter(card.instanceId, c, d)}
                    onSetKeywords={kws => onSetKeywords(card.instanceId, kws)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Battlefield */}
        <div style={{ position:'absolute', left:0, top:0, width:CANVAS_W, height:CANVAS_H, zIndex:0 }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; setOverBf(true); }}
          onDragLeave={() => setOverBf(false)}
          onDrop={e => {
            e.preventDefault(); setOverBf(false);
            try { const d: DragData = JSON.parse(e.dataTransfer.getData('application/json'));
              if (d.source === 'hand') onPlayFromHand(d.instanceId);
            } catch { /**/ }
          }} />

        {overBf && (
          <div style={{ position:'absolute', left:20, top:20, right:20, bottom:20, borderRadius:14, pointerEvents:'none', zIndex:1,
            border:'2px solid rgba(134,239,172,0.7)', background:'rgba(134,239,172,0.06)' }} />
        )}

        {battlefield.length === 0 && (
          <p style={{ position:'absolute', left:CMD_W + 60, top:60, color:'rgba(255,255,255,0.06)', fontSize:13, pointerEvents:'none', fontStyle:'italic' }}>
            Drag cards from hand to play
          </p>
        )}

        {/* Card rows */}
        {rows.map(row => (
          <React.Fragment key={row.label}>
            <div style={{ position:'absolute', left:CMD_W + C_LBLW - 4, top:row.y + row.cH/2 - 8, textAlign:'right', pointerEvents:'none', width:60 }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:1.5, color:row.isLand?'rgba(134,239,172,0.7)':'rgba(255,255,255,0.55)' }}>
                {row.label.split('/')[0].toUpperCase()}
              </span>
            </div>
            {row.slots.map(slot => {
              const card = cardMap.get(slot.topId);
              if (!card) return null;
              const stackN = slot.groupIds.length;
              const isOpen = stackPopover?.groupIds[0] === slot.topId;
              return (
                <div key={slot.topId} style={{ position:'absolute', left:CMD_W + slot.x, top:row.y, zIndex:2 }}
                  onMouseDown={e => e.stopPropagation()}>
                  <div style={{ position:'relative', width:row.cW, height:row.cH, isolation:'isolate' }}>
                    {stackN > 1 && slot.groupIds.slice(1, Math.min(stackN, 4)).map((gid, gi) => {
                      const gc = cardMap.get(gid);
                      return (
                        <div key={gid} style={{ position:'absolute', top:(gi+1)*3, left:(gi+1)*3, width:row.cW, height:row.cH, borderRadius:6, overflow:'hidden', pointerEvents:'none' }}>
                          {(gc??card).imageUri
                            ? <img src={(gc??card).imageUri} style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.5 }} alt="" />
                            : <div style={{ width:'100%', height:'100%', background:'#1a2d40', borderRadius:6 }} />}
                        </div>
                      );
                    })}
                    <div style={{ position:'absolute', top:0, left:0 }}>
                      <LocalBfCard card={card} cardW={row.cW} cardH={row.cH}
                        onTap={() => onTap(card.instanceId)}
                        onGraveyard={() => onGraveyard(card.instanceId)}
                        onExile={() => onExile(card.instanceId)}
                        onReturnHand={() => onReturnHand(card.instanceId)}
                        onReturnCommander={() => onReturnCommander(card.instanceId)}
                        onDragStart={makeDrag(card.instanceId, 'battlefield')}
                        onHover={onHover} onHoverEnd={onHoverEnd}
                        onUpdateCounter={(c, d) => onUpdateCounter(card.instanceId, c, d)}
                        onSetKeywords={kws => onSetKeywords(card.instanceId, kws)} />
                    </div>
                    {stackN > 1 && (
                      <div onClick={e => { e.stopPropagation(); e.preventDefault();
                        setStackPopover(isOpen ? null : { groupIds: slot.groupIds, canvasX: CMD_W + slot.x, canvasY: row.y, cW: row.cW, cH: row.cH }); }}
                        style={{ position:'absolute', bottom:4, right:4, zIndex:50, background:isOpen?'#1d4ed8':'rgba(37,99,235,0.92)', color:'#fff', borderRadius:4, padding:'1px 5px', fontSize:12, fontWeight:900, lineHeight:'20px', minWidth:20, textAlign:'center', border:'1px solid rgba(255,255,255,0.25)', cursor:'pointer', boxShadow:'0 1px 4px rgba(0,0,0,0.6)', userSelect:'none' }}>
                        ×{stackN}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}

        {/* Stack popover */}
        {stackPopover && (() => {
          const CW = Math.round(stackPopover.cW * 0.72), CH = Math.round(stackPopover.cH * 0.72);
          return (
            <div style={{ position:'absolute', left:stackPopover.canvasX, top:stackPopover.canvasY - CH - 16, zIndex:300,
              display:'flex', flexDirection:'row', gap:8, background:'rgba(6,9,18,0.97)',
              border:'1px solid rgba(100,116,139,0.4)', borderRadius:10, padding:10, boxShadow:'0 12px 48px rgba(0,0,0,0.9)' }}
              onMouseDown={e => e.stopPropagation()}>
              <button onClick={() => setStackPopover(null)} style={{ position:'absolute', top:-8, right:-8, zIndex:10, background:'#1e293b', border:'1px solid #334155', color:'#94a3b8', borderRadius:'50%', width:18, height:18, fontSize:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              {stackPopover.groupIds.map(id => {
                const c = cardMap.get(id);
                if (!c) return null;
                return (
                  <div key={id} onMouseDown={e => e.stopPropagation()}>
                    <LocalBfCard card={c} cardW={CW} cardH={CH}
                      onTap={() => { onTap(c.instanceId); setStackPopover(prev => { if (!prev) return null; const rest = prev.groupIds.filter(g=>g!==id); return rest.length>1?{...prev,groupIds:rest}:null; }); }}
                      onGraveyard={() => { onGraveyard(c.instanceId); setStackPopover(null); }}
                      onExile={() => { onExile(c.instanceId); setStackPopover(null); }}
                      onReturnHand={() => { onReturnHand(c.instanceId); setStackPopover(null); }}
                      onReturnCommander={() => { onReturnCommander(c.instanceId); setStackPopover(null); }}
                      onDragStart={makeDrag(c.instanceId, 'battlefield')}
                      onHover={onHover} onHoverEnd={onHoverEnd}
                      onUpdateCounter={(ct, d) => onUpdateCounter(c.instanceId, ct, d)}
                      onSetKeywords={kws => onSetKeywords(c.instanceId, kws)} />
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Graveyard + Exile drop zones */}
        <div style={{ position:'absolute', bottom:14, right:14, display:'flex', gap:14, zIndex:4 }}
          onMouseDown={e => e.stopPropagation()}>
          <CanvasPileZone cards={graveyard} icon="🪦" label="Graveyard" color="#9ca3af" bgColor="#374151"
            isOver={overGy} onDragOver={() => setOverGy(true)} onDragLeave={() => setOverGy(false)}
            onDrop={d => { setOverGy(false); if (d.source === 'battlefield') onGraveyard(d.instanceId); }}
            onClick={onOpenGy} onHover={onHover} onHoverEnd={onHoverEnd} />
          <CanvasPileZone cards={exile} icon="✦" label="Exile" color="#a78bfa" bgColor="#4c1d95"
            isOver={overEx} onDragOver={() => setOverEx(true)} onDragLeave={() => setOverEx(false)}
            onDrop={d => { setOverEx(false); if (d.source === 'battlefield') onExile(d.instanceId); }}
            onClick={onOpenEx} onHover={onHover} onHoverEnd={onHoverEnd} />
        </div>
      </div>

      {/* Card size widget */}
      <div style={{ position:'fixed', bottom:14, right:14, zIndex:9999, display:'flex', alignItems:'center', gap:4,
        background:'rgba(8,11,20,0.90)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.13)',
        borderRadius:20, padding:'5px 10px', boxShadow:'0 2px 16px rgba(0,0,0,0.6)' }}
        onMouseDown={e => e.stopPropagation()}>
        <button onClick={() => setCardSize(s => Math.max(60, s-10))} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:15, fontWeight:700, padding:'0 3px' }}>🃏 −</button>
        <span style={{ fontSize:11, fontWeight:700, color:'#d1d5db', fontFamily:'monospace', minWidth:42, textAlign:'center' }}>{cardSize}px</span>
        <button onClick={() => setCardSize(s => Math.min(275, s+10))} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:15, fontWeight:700, padding:'0 3px' }}>+ 🃏</button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PlaytestPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [deckName, setDeckName]     = useState('Deck');
  const [baseProtos, setBaseProtos] = useState<Omit<GameCard, 'instanceId' | 'tapped'>[]>([]);
  const [state, setState]           = useState<SoloState>({ library:[], hand:[], battlefield:[], graveyard:[], exile:[], commandZone:[] });
  const [life, setLife]             = useState(40);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [manaPool, setManaPool]     = useState<ManaPoolState>(EMPTY_MANA);
  const [manaFromCard, setManaFromCard] = useState<Record<string, ManaPoolState>>({});
  const [diceResult, setDiceResult] = useState<string | null>(null);
  const [hoverCard, setHoverCard]   = useState<{ card: GameCard; x: number; y: number } | null>(null);
  const mousePos = useRef({ x: 0, y: 0 });

  const [viewGy, setViewGy]         = useState(false);
  const [viewEx, setViewEx]         = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);

  // Supabase deck load
  useEffect(() => {
    if (!deckId) return;
    Promise.all([
      supabase.from('decks').select('name').eq('id', deckId).single(),
      supabase.from('deck_cards').select('*').eq('deck_id', deckId),
    ]).then(([{ data: deck }, { data: cards }]) => {
      if (deck) setDeckName(deck.name);
      const protos: Omit<GameCard, 'instanceId' | 'tapped'>[] = (cards ?? []).flatMap(c => {
        const base: GameCard = {
          instanceId: '', tapped: false,
          scryfallId: c.scryfall_id, name: c.card_name,
          imageUri: c.image_uri ?? '', typeLine: c.type_line ?? '',
          oracleText: c.oracle_text ?? '', power: c.power ?? undefined,
          toughness: c.toughness ?? undefined, isCommander: c.is_commander ?? false,
          isToken: false, counters: {},
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { instanceId: _i, tapped: _t, ...rest } = enrichKeywords(base);
        return Array.from({ length: c.quantity ?? 1 }, () => ({ ...rest }));
      });
      setBaseProtos(protos);
      setState(buildState(protos, 7));
      setLoading(false);
    });
  }, [deckId]);

  // ── State helpers ──────────────────────────────────────────────────────────

  function moveBetweenZones(instanceId: string, from: SoloZone, to: SoloZone, tapped = false) {
    setState(s => {
      const card = (s[from] as GameCard[]).find(c => c.instanceId === instanceId);
      if (!card) return s;
      return {
        ...s,
        [from]: (s[from] as GameCard[]).filter(c => c.instanceId !== instanceId),
        [to]:   [...(s[to]   as GameCard[]), { ...card, tapped }],
      };
    });
  }

  function updateBfCard(instanceId: string, updater: (c: GameCard) => GameCard) {
    setState(s => ({ ...s, battlefield: s.battlefield.map(c => c.instanceId === instanceId ? updater(c) : c) }));
  }

  function updateAllZones(instanceId: string, updater: (c: GameCard) => GameCard) {
    const zones: SoloZone[] = ['library','hand','battlefield','graveyard','exile','commandZone'];
    setState(s => {
      const next = { ...s };
      for (const z of zones) {
        if ((next[z] as GameCard[]).some(c => c.instanceId === instanceId))
          next[z] = (next[z] as GameCard[]).map(c => c.instanceId === instanceId ? updater(c) : c) as GameCard[];
      }
      return next;
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function draw(n = 1) {
    setState(s => {
      const n2 = Math.min(n, s.library.length);
      if (n2 === 0) return s;
      return { ...s, hand: [...s.hand, ...s.library.slice(-n2)], library: s.library.slice(0, -n2) };
    });
  }

  function mulligan() {
    const newCount = mulliganCount + 1;
    const drawN = Math.max(0, 7 - newCount);
    setState(s => {
      const pool = shuffleArr([
        ...s.hand, ...s.battlefield, ...s.graveyard, ...s.exile, ...s.library,
      ].map(c => instCard(c)));
      const n = Math.min(drawN, pool.length);
      return { ...s, hand: pool.slice(-n), library: pool.slice(0,-n), battlefield: [], graveyard: [], exile: [] };
    });
    setMulliganCount(newCount);
    setManaPool(EMPTY_MANA); setManaFromCard({});
  }

  function reset() {
    setState(buildState(baseProtos, 7));
    setLife(40); setMulliganCount(0); setDiceResult(null);
    setManaPool(EMPTY_MANA); setManaFromCard({});
  }

  function untapAll() {
    setState(s => ({ ...s, battlefield: s.battlefield.map(c => ({ ...c, tapped: false })) }));
    setManaPool(EMPTY_MANA); setManaFromCard({});
  }

  function handleTap(instanceId: string) {
    const card = state.battlefield.find(c => c.instanceId === instanceId)
      ?? state.commandZone.find(c => c.instanceId === instanceId);
    if (card) {
      const oracle = card.oracleText ?? '';
      if (/\badd\b/i.test(oracle)) {
        if (card.tapped) {
          const was = manaFromCard[instanceId];
          if (was) {
            setManaPool(p => {
              const next = { ...p };
              for (const k of Object.keys(was) as (keyof ManaPoolState)[])
                next[k] = Math.max(0, (next[k] as number) - (was[k] as number));
              return next;
            });
            setManaFromCard(m => { const n = { ...m }; delete n[instanceId]; return n; });
          }
        } else {
          const added = parseManaFromOracle(oracle);
          setManaPool(p => {
            const next = { ...p };
            for (const k of Object.keys(added) as (keyof ManaPoolState)[])
              next[k] = (next[k] as number) + (added[k] as number);
            return next;
          });
          setManaFromCard(m => ({ ...m, [instanceId]: added }));
        }
      }
    }
    updateAllZones(instanceId, c => ({ ...c, tapped: !c.tapped }));
  }

  function handleGraveyard(instanceId: string) {
    const zone = (['hand','battlefield','exile','commandZone'] as SoloZone[]).find(z => (state[z] as GameCard[]).some(c => c.instanceId === instanceId));
    if (zone) moveBetweenZones(instanceId, zone, 'graveyard');
  }
  function handleExile(instanceId: string) {
    const zone = (['hand','battlefield','graveyard','commandZone'] as SoloZone[]).find(z => (state[z] as GameCard[]).some(c => c.instanceId === instanceId));
    if (zone) moveBetweenZones(instanceId, zone, 'exile');
  }
  function handleReturnHand(instanceId: string) {
    const zone = (['battlefield','graveyard','exile','commandZone'] as SoloZone[]).find(z => (state[z] as GameCard[]).some(c => c.instanceId === instanceId));
    if (zone) moveBetweenZones(instanceId, zone, 'hand');
  }
  function handleReturnCommander(instanceId: string) {
    const zone = (['battlefield','graveyard','exile'] as SoloZone[]).find(z => (state[z] as GameCard[]).some(c => c.instanceId === instanceId));
    if (zone) moveBetweenZones(instanceId, zone, 'commandZone');
  }
  function handlePlayFromHand(instanceId: string) {
    moveBetweenZones(instanceId, 'hand', 'battlefield');
  }
  function handlePlayFromCommandZone(instanceId: string) {
    moveBetweenZones(instanceId, 'commandZone', 'battlefield');
  }
  function handleUpdateCounter(instanceId: string, counter: string, delta: number) {
    updateAllZones(instanceId, c => ({ ...c, counters: { ...(c.counters??{}), [counter]: Math.max(0, ((c.counters??{})[counter]??0) + delta) } }));
  }
  function handleSetKeywords(instanceId: string, kws: string[]) {
    updateAllZones(instanceId, c => ({ ...c, keywords: kws }));
  }
  function handleCreateToken(proto: Omit<GameCard, 'instanceId' | 'tapped'>) {
    setState(s => ({ ...s, battlefield: [...s.battlefield, instCard(proto)] }));
  }

  function rollDice(sides: number) {
    setDiceResult(`d${sides}: ${Math.ceil(Math.random() * sides)}`);
  }

  function handleManaAdjust(color: keyof ManaPoolState, delta: number) {
    setManaPool(p => ({ ...p, [color]: Math.max(0, (p[color] as number) + delta) }));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#030712' }}>
        <span style={{ color: '#6b7280', fontSize: 14 }}>Loading deck…</span>
      </div>
    );
  }

  function tbtn(bg: string): React.CSSProperties {
    return { padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
      background:`${bg}55`, border:`1px solid ${bg}`, color:'#e5e7eb', whiteSpace:'nowrap' };
  }

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'#030712', color:'#f1f5f9', overflow:'hidden', fontFamily:'system-ui, sans-serif' }}
      onMouseMove={e => {
        mousePos.current = { x: e.clientX, y: e.clientY };
        if (hoverCard) setHoverCard(h => h ? { ...h, x: e.clientX, y: e.clientY } : null);
      }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', flexShrink:0,
        background:'rgba(0,0,0,0.7)', borderBottom:'1px solid rgba(255,255,255,0.07)', flexWrap:'wrap' }}>

        <button onClick={() => navigate('/profile')} style={tbtn('#374151')}>← Decks</button>
        <span style={{ fontSize:12, fontWeight:700, color:'#94a3b8', marginRight:4 }}>{deckName}</span>
        <span style={{ fontSize:10, color:'#374151' }}>solo</span>
        <div style={{ flex:1 }} />

        {/* Life */}
        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
          <button onClick={() => setLife(l => l-5)} style={tbtn('#7f1d1d')}>−5</button>
          <button onClick={() => setLife(l => l-1)} style={tbtn('#7f1d1d')}>−</button>
          <span style={{ fontSize:22, fontWeight:900, color:life<=0?'#f87171':life<=10?'#fb923c':'#f1f5f9', minWidth:42, textAlign:'center' }}>{life}</span>
          <button onClick={() => setLife(l => l+1)} style={tbtn('#166534')}>+</button>
          <button onClick={() => setLife(l => l+5)} style={tbtn('#166534')}>+5</button>
          <span style={{ fontSize:9, color:'#374151' }}>LIFE</span>
        </div>

        <div style={{ width:1, height:18, background:'rgba(255,255,255,0.1)' }} />

        {/* Library + Draw */}
        <span style={{ fontSize:11, color:'#6b7280', fontWeight:600 }}>📚 {state.library.length}</span>
        <button onClick={() => draw(1)} style={tbtn('#1e3a5f')}>Draw</button>
        <button onClick={untapAll} style={tbtn('#14532d')}>Untap All</button>
        <button onClick={mulligan} style={tbtn('#374151')}>
          Mulligan{mulliganCount > 0 ? ` (→${Math.max(0,7-mulliganCount)})` : ''}
        </button>
        <button onClick={() => setState(s => ({ ...s, library: shuffleArr(s.library) }))} style={tbtn('#374151')}>Shuffle</button>
        <button onClick={() => setShowTokenModal(true)} style={tbtn('#4a1d96')}>+ Token</button>

        <div style={{ width:1, height:18, background:'rgba(255,255,255,0.1)' }} />

        {/* Graveyard / Exile counts */}
        <button onClick={() => setViewGy(true)} style={tbtn('#374151')}>🪦 {state.graveyard.length}</button>
        <button onClick={() => setViewEx(true)} style={tbtn('#4c1d95')}>↗ {state.exile.length}</button>

        <div style={{ width:1, height:18, background:'rgba(255,255,255,0.1)' }} />

        {/* Dice */}
        <button onClick={() => rollDice(6)} style={tbtn('#374151')}>d6</button>
        <button onClick={() => rollDice(20)} style={tbtn('#374151')}>d20</button>
        {diceResult && <span style={{ fontSize:12, fontWeight:700, color:'#fbbf24', minWidth:56 }}>{diceResult}</span>}

        <div style={{ width:1, height:18, background:'rgba(255,255,255,0.1)' }} />
        <button onClick={reset} style={tbtn('#7f1d1d')}>Reset</button>
      </div>

      {/* ── Canvas area ── */}
      <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
        <SoloCanvas
          battlefield={state.battlefield}
          commandZone={state.commandZone}
          graveyard={state.graveyard}
          exile={state.exile}
          onTap={handleTap}
          onGraveyard={handleGraveyard}
          onExile={handleExile}
          onReturnHand={handleReturnHand}
          onReturnCommander={handleReturnCommander}
          onUpdateCounter={handleUpdateCounter}
          onSetKeywords={handleSetKeywords}
          onPlayFromHand={handlePlayFromHand}
          onOpenGy={() => setViewGy(true)}
          onOpenEx={() => setViewEx(true)}
          onHover={(card) => setHoverCard({ card, x: mousePos.current.x, y: mousePos.current.y })}
          onHoverEnd={() => setHoverCard(null)}
        />
      </div>

      {/* ── Hand strip ── */}
      <div style={{ flexShrink:0, borderTop:'1px solid rgba(255,255,255,0.07)', background:'rgba(0,0,0,0.5)', padding:'6px 10px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:4 }}>
          <span style={{ fontSize:9, fontWeight:800, color:'#4b5563', letterSpacing:1.5, textTransform:'uppercase' }}>Hand ({state.hand.length})</span>
        </div>
        <div style={{ display:'flex', gap:5, overflowX:'auto', paddingBottom:2 }}>
          {state.hand.length === 0 && <span style={{ fontSize:11, color:'#1f2937', padding:'4px 0' }}>Empty — draw cards</span>}
          {state.hand.map(card => {
            const cW = 78, cH = Math.round(78 * 1.4);
            return (
              <div key={card.instanceId} draggable
                onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ instanceId: card.instanceId, source: 'hand' })); e.dataTransfer.effectAllowed = 'move'; }}
                onContextMenu={e => { e.preventDefault(); handlePlayFromHand(card.instanceId); }}
                onMouseEnter={e => setHoverCard({ card, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHoverCard(null)}
                style={{ position:'relative', flexShrink:0, width:cW, height:cH, cursor:'grab' }}
                title={`${card.name} — right-click or drag to battlefield to play`}>
                {card.imageUri
                  ? <img src={card.imageUri} alt={card.name} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:6, border:'1px solid rgba(255,255,255,0.12)', boxShadow:'0 2px 8px rgba(0,0,0,0.6)' }} />
                  : <div style={{ width:'100%', height:'100%', borderRadius:6, background:'#1f2937', border:'1px solid #374151', display:'flex', alignItems:'center', justifyContent:'center', padding:3 }}>
                      <span style={{ fontSize:8, color:'#6b7280', textAlign:'center' }}>{card.name}</span>
                    </div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mana pool */}
      <ManaPoolTracker pool={manaPool} onAdjust={handleManaAdjust} />

      {/* Hover preview */}
      {hoverCard && <HoverPreview card={hoverCard.card} x={hoverCard.x} y={hoverCard.y} />}

      {/* Zone viewers */}
      {viewGy && (
        <ZoneModal title="Graveyard" cards={state.graveyard} onClose={() => setViewGy(false)} actions={[
          { label: '✋ Return to Hand',       onCard: c => { moveBetweenZones(c.instanceId, 'graveyard', 'hand');      setViewGy(false); } },
          { label: '▶ Return to Battlefield', onCard: c => { moveBetweenZones(c.instanceId, 'graveyard', 'battlefield'); setViewGy(false); }, color: '#86efac' },
          { label: '⚜ Return to Command Zone', onCard: c => { if (c.isCommander) { moveBetweenZones(c.instanceId, 'graveyard', 'commandZone'); setViewGy(false); } }, color: '#fbbf24' },
          { label: '↗ Exile',                onCard: c => { moveBetweenZones(c.instanceId, 'graveyard', 'exile');     setViewGy(false); }, color: '#c4b5fd' },
        ]} />
      )}
      {viewEx && (
        <ZoneModal title="Exile" cards={state.exile} onClose={() => setViewEx(false)} actions={[
          { label: '✋ Return to Hand',        onCard: c => { moveBetweenZones(c.instanceId, 'exile', 'hand');         setViewEx(false); } },
          { label: '▶ Return to Battlefield',  onCard: c => { moveBetweenZones(c.instanceId, 'exile', 'battlefield'); setViewEx(false); }, color: '#86efac' },
        ]} />
      )}

      {showTokenModal && (
        <TokenModal onClose={() => setShowTokenModal(false)} onCreate={handleCreateToken} />
      )}
    </div>
  );
}
