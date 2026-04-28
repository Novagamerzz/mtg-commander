import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PCard {
  instanceId: string;
  scryfallId: string;
  name: string;
  imageUri: string;
  typeLine: string;
  isCommander: boolean;
  tapped: boolean;
  counters: Record<string, number>;
  power?: string;
  toughness?: string;
  isToken?: boolean;
}

type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'commandZone';

interface PState {
  library: PCard[];
  hand: PCard[];
  battlefield: PCard[];
  graveyard: PCard[];
  exile: PCard[];
  commandZone: PCard[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type CardProto = Omit<PCard, 'instanceId' | 'tapped' | 'counters'>;

function inst(proto: CardProto): PCard {
  return { ...proto, instanceId: uid(), tapped: false, counters: {} };
}

function buildInitialState(protos: CardProto[]): PState {
  const commanders = protos.filter(p => p.isCommander).map(inst);
  const rest = shuffle(protos.filter(p => !p.isCommander).map(inst));
  return {
    commandZone: commanders,
    library: rest,
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
  };
}

// ── Token presets ─────────────────────────────────────────────────────────────

const TOKEN_PRESETS = [
  { name: 'Saproling', power: '1', toughness: '1', typeLine: 'Token Creature — Saproling', color: '#166534' },
  { name: 'Soldier',   power: '1', toughness: '1', typeLine: 'Token Creature — Soldier',   color: '#1e3a5f' },
  { name: 'Goblin',    power: '1', toughness: '1', typeLine: 'Token Creature — Goblin',    color: '#7f1d1d' },
  { name: 'Zombie',    power: '2', toughness: '2', typeLine: 'Token Creature — Zombie',    color: '#1a1a2e' },
  { name: 'Beast',     power: '3', toughness: '3', typeLine: 'Token Creature — Beast',     color: '#14532d' },
  { name: 'Dragon',    power: '4', toughness: '4', typeLine: 'Token Creature — Dragon',    color: '#450a0a' },
  { name: 'Treasure',  power: '',  toughness: '',  typeLine: 'Token Artifact — Treasure',  color: '#78350f' },
  { name: 'Clue',      power: '',  toughness: '',  typeLine: 'Token Artifact — Clue',      color: '#1e3a5f' },
  { name: 'Food',      power: '',  toughness: '',  typeLine: 'Token Artifact — Food',      color: '#422006' },
];

// ── Tiny card component ────────────────────────────────────────────────────────

function PtestCard({
  card,
  size = 100,
  onClick,
  showTapIndicator = true,
}: {
  card: PCard;
  size?: number;
  onClick?: () => void;
  showTapIndicator?: boolean;
}) {
  const h = Math.round(size * 1.4);
  const pp = (card.counters['+1/+1'] ?? 0) - (card.counters['-1/-1'] ?? 0);
  const isCreature = card.typeLine.includes('Creature');
  const basePow = card.power ?? null;
  const baseTou = card.toughness ?? null;
  const showPt = isCreature && (basePow !== null || baseTou !== null);
  const fmt = (b: string | null) => {
    const n = b === '*' ? 0 : parseInt(b ?? '0', 10);
    return isNaN(n) ? (b ?? '?') : String(Math.max(0, n + pp));
  };

  const nonCreatureCounterTotal = !isCreature
    ? Object.values(card.counters).filter(n => n > 0).reduce((s, n) => s + n, 0)
    : 0;

  return (
    <div
      onClick={onClick}
      style={{
        width: card.tapped ? h : size,
        height: card.tapped ? size : h,
        transform: card.tapped ? 'rotate(90deg)' : 'none',
        transformOrigin: 'center center',
        flexShrink: 0,
        position: 'relative',
        borderRadius: 6,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        border: card.tapped ? '2px solid rgba(250,204,21,0.6)' : '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
        transition: 'transform 0.15s',
      }}
    >
      {card.imageUri ? (
        <img src={card.imageUri} alt={card.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
          <span style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>{card.name}</span>
        </div>
      )}

      {/* P/T for creature tokens */}
      {card.isToken && showPt && (
        <div style={{
          position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', borderRadius: 6, padding: '1px 8px',
          fontSize: 13, fontWeight: 900, color: '#fff', whiteSpace: 'nowrap', zIndex: 5,
        }}>
          {fmt(basePow)}/{fmt(baseTou)}
        </div>
      )}

      {/* P/T bar for regular creatures */}
      {!card.isToken && showPt && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 18,
          background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 2, fontSize: 11, fontWeight: 800, color: '#f1f5f9', zIndex: 5,
        }}>
          <span style={{ fontSize: 9 }}>⚔</span>
          <span>{fmt(basePow)}</span>
          <span style={{ opacity: 0.4 }}>/</span>
          <span style={{ fontSize: 9 }}>🛡</span>
          <span>{fmt(baseTou)}</span>
        </div>
      )}

      {/* Counter total for non-creature tokens */}
      {card.isToken && !isCreature && nonCreatureCounterTotal > 0 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(0,0,0,0.85)', borderRadius: 10, padding: '3px 12px',
          fontSize: 20, fontWeight: 900, color: '#fff', zIndex: 5,
        }}>
          {nonCreatureCounterTotal}
        </div>
      )}

      {/* +1/+1 counter badge on non-token creatures */}
      {!card.isToken && pp !== 0 && (
        <div style={{
          position: 'absolute', top: 2, left: 2,
          background: pp > 0 ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)',
          borderRadius: 4, padding: '1px 4px', fontSize: 9, fontWeight: 800, color: '#fff', zIndex: 5,
        }}>
          {pp > 0 ? `+${pp}/+${pp}` : `${pp}/${pp}`}
        </div>
      )}

      {showTapIndicator && card.tapped && (
        <div style={{
          position: 'absolute', top: 2, right: 2, background: 'rgba(250,204,21,0.9)',
          borderRadius: 4, padding: '1px 4px', fontSize: 8, fontWeight: 800, color: '#000', zIndex: 5,
        }}>TAP</div>
      )}
    </div>
  );
}

// ── Card action menu ───────────────────────────────────────────────────────────

function CardMenu({
  card, zone, onAction, onClose,
}: {
  card: PCard; zone: Zone;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const actions: { label: string; id: string; color?: string }[] = [];
  if (zone === 'hand') {
    actions.push({ label: '▶ Play to Battlefield', id: 'play' });
    actions.push({ label: '🪦 Discard', id: 'discard', color: '#f87171' });
    actions.push({ label: '↗ Exile', id: 'exile_from_hand', color: '#a78bfa' });
  }
  if (zone === 'battlefield') {
    actions.push({ label: card.tapped ? '↺ Untap' : '⟳ Tap', id: 'tap' });
    actions.push({ label: '✋ Return to Hand', id: 'to_hand' });
    actions.push({ label: '🪦 Send to Graveyard', id: 'to_gy', color: '#f87171' });
    actions.push({ label: '↗ Exile', id: 'to_exile', color: '#a78bfa' });
    actions.push({ label: '+ Counter', id: 'add_counter' });
    actions.push({ label: '− Counter', id: 'rem_counter' });
  }
  if (zone === 'commandZone') {
    actions.push({ label: '▶ Play to Battlefield', id: 'play' });
  }
  if (zone === 'graveyard') {
    actions.push({ label: '✋ Return to Hand', id: 'to_hand' });
    actions.push({ label: '▶ Return to Battlefield', id: 'play' });
  }
  if (zone === 'exile') {
    actions.push({ label: '✋ Return to Hand', id: 'to_hand' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="rounded-2xl overflow-hidden"
        style={{ width: 280, background: '#0f172a', border: '1px solid #334155', boxShadow: '0 32px 64px rgba(0,0,0,0.9)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{card.name}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '6px 0' }}>
          {actions.map(a => (
            <button key={a.id} onClick={() => { onAction(a.id); onClose(); }}
              style={{
                width: '100%', textAlign: 'left', padding: '9px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: a.color ?? '#e5e7eb', fontWeight: 500,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Zone viewer modal ──────────────────────────────────────────────────────────

function ZoneViewer({
  title, cards, onClose, onCardClick,
}: {
  title: string; cards: PCard[]; onClose: () => void;
  onCardClick?: (card: PCard) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="flex flex-col rounded-2xl overflow-hidden"
        style={{ width: '80vw', maxWidth: 900, maxHeight: '85vh', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{title} ({cards.length})</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
          {cards.length === 0 && <p style={{ color: '#374151', gridColumn: '1/-1', textAlign: 'center', padding: 40 }}>Empty</p>}
          {cards.map(card => (
            <div key={card.instanceId} style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: onCardClick ? 'pointer' : 'default' }}
              onClick={() => onCardClick?.(card)}>
              <PtestCard card={card} size={110} showTapIndicator={false} />
              <span style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>{card.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Token create modal ─────────────────────────────────────────────────────────

function TokenModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (proto: CardProto) => void;
}) {
  const [custom, setCustom] = useState({ name: '', power: '', toughness: '', typeLine: 'Token Creature' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div className="rounded-2xl overflow-hidden"
        style={{ width: 320, background: '#0f172a', border: '1px solid #334155' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Create Token</span>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TOKEN_PRESETS.map(p => (
              <button key={p.name + p.typeLine} onClick={() => {
                onCreate({ scryfallId: `token-${uid()}`, name: p.name, imageUri: '', typeLine: p.typeLine, isCommander: false, power: p.power || undefined, toughness: p.toughness || undefined, isToken: true });
                onClose();
              }} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: p.color + '33', border: `1px solid ${p.color}88`, color: '#e5e7eb',
              }}>
                {p.name}{p.power ? ` ${p.power}/${p.toughness}` : ''}
              </button>
            ))}
          </div>
          <hr style={{ borderColor: '#1e293b' }} />
          <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Custom Token</p>
          <input value={custom.name} onChange={e => setCustom(p => ({ ...p, name: e.target.value }))}
            placeholder="Name" style={inputStyle} />
          <input value={custom.typeLine} onChange={e => setCustom(p => ({ ...p, typeLine: e.target.value }))}
            placeholder="Type line" style={inputStyle} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={custom.power} onChange={e => setCustom(p => ({ ...p, power: e.target.value }))}
              placeholder="Power" style={{ ...inputStyle, flex: 1 }} />
            <input value={custom.toughness} onChange={e => setCustom(p => ({ ...p, toughness: e.target.value }))}
              placeholder="Toughness" style={{ ...inputStyle, flex: 1 }} />
          </div>
          <button onClick={() => {
            if (!custom.name) return;
            onCreate({ scryfallId: `token-${uid()}`, name: custom.name, imageUri: '', typeLine: custom.typeLine, isCommander: false, power: custom.power || undefined, toughness: custom.toughness || undefined, isToken: true });
            onClose();
          }} style={{ padding: '8px 0', borderRadius: 8, background: '#1d4ed8', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontSize: 12, width: '100%',
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PlaytestPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [deckName, setDeckName] = useState('Deck');
  const [baseProtos, setBaseProtos] = useState<CardProto[]>([]);

  const [state, setState] = useState<PState>({ library: [], hand: [], battlefield: [], graveyard: [], exile: [], commandZone: [] });
  const [life, setLife] = useState(40);
  const [diceResult, setDiceResult] = useState<string | null>(null);

  const [selected, setSelected] = useState<{ card: PCard; zone: Zone } | null>(null);
  const [viewZone, setViewZone] = useState<Zone | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);

  // Load deck
  useEffect(() => {
    if (!deckId) return;
    Promise.all([
      supabase.from('decks').select('name').eq('id', deckId).single(),
      supabase.from('deck_cards').select('*').eq('deck_id', deckId),
    ]).then(([{ data: deck }, { data: cards }]) => {
      if (deck) setDeckName(deck.name);
      const protos: CardProto[] = (cards ?? []).flatMap(c =>
        Array.from({ length: c.quantity ?? 1 }, () => ({
          scryfallId: c.scryfall_id,
          name: c.card_name,
          imageUri: c.image_uri ?? '',
          typeLine: c.type_line ?? '',
          isCommander: c.is_commander ?? false,
          power: c.power ?? undefined,
          toughness: c.toughness ?? undefined,
          isToken: false,
        }))
      );
      setBaseProtos(protos);
      setState(buildInitialState(protos));
      setLoading(false);
    });
  }, [deckId]);

  function reset() {
    setState(buildInitialState(baseProtos));
    setLife(40);
    setDiceResult(null);
    setSelected(null);
    setViewZone(null);
  }

  function draw(n = 1) {
    setState(s => {
      const toDraw = Math.min(n, s.library.length);
      if (toDraw === 0) return s;
      return {
        ...s,
        hand: [...s.hand, ...s.library.slice(-toDraw)],
        library: s.library.slice(0, -toDraw),
      };
    });
  }

  function mulligan() {
    setState(s => {
      const pool = shuffle([
        ...s.hand, ...s.battlefield, ...s.graveyard, ...s.exile, ...s.library,
      ].map(c => inst({ scryfallId: c.scryfallId, name: c.name, imageUri: c.imageUri, typeLine: c.typeLine, isCommander: false, power: c.power, toughness: c.toughness, isToken: c.isToken })));
      return {
        ...s,
        hand: pool.slice(-7),
        library: pool.slice(0, -7),
        battlefield: [],
        graveyard: [],
        exile: [],
      };
    });
    setSelected(null);
  }

  function removeFromZone(card: PCard, zone: Zone) {
    setState(s => ({ ...s, [zone]: (s[zone] as PCard[]).filter(c => c.instanceId !== card.instanceId) }));
  }

  function addToZone(card: PCard, zone: Zone, untap = true) {
    setState(s => ({ ...s, [zone]: [...(s[zone] as PCard[]), untap ? { ...card, tapped: false } : card] }));
  }

  function moveTo(card: PCard, from: Zone, to: Zone, untap = true) {
    setState(s => ({
      ...s,
      [from]: (s[from] as PCard[]).filter(c => c.instanceId !== card.instanceId),
      [to]: [...(s[to] as PCard[]), untap ? { ...card, tapped: false } : card],
    }));
    setSelected(null);
  }

  function handleCardAction(card: PCard, zone: Zone, action: string) {
    if (action === 'tap') {
      setState(s => ({ ...s, battlefield: s.battlefield.map(c => c.instanceId === card.instanceId ? { ...c, tapped: !c.tapped } : c) }));
    } else if (action === 'play') {
      moveTo(card, zone, 'battlefield');
    } else if (action === 'discard') {
      moveTo(card, zone, 'graveyard');
    } else if (action === 'exile_from_hand') {
      moveTo(card, zone, 'exile');
    } else if (action === 'to_hand') {
      moveTo(card, zone, 'hand');
    } else if (action === 'to_gy') {
      moveTo(card, zone, 'graveyard');
    } else if (action === 'to_exile') {
      moveTo(card, zone, 'exile');
    } else if (action === 'add_counter') {
      setState(s => ({
        ...s,
        battlefield: s.battlefield.map(c => c.instanceId === card.instanceId
          ? { ...c, counters: { ...c.counters, '+1/+1': (c.counters['+1/+1'] ?? 0) + 1 } }
          : c),
      }));
    } else if (action === 'rem_counter') {
      setState(s => ({
        ...s,
        battlefield: s.battlefield.map(c => c.instanceId === card.instanceId
          ? { ...c, counters: { ...c.counters, '+1/+1': Math.max(0, (c.counters['+1/+1'] ?? 0) - 1) } }
          : c),
      }));
    }
  }

  function handleViewZoneAction(card: PCard, action: string) {
    if (!viewZone) return;
    if (action === 'to_hand') moveTo(card, viewZone, 'hand');
    else if (action === 'play') moveTo(card, viewZone, 'battlefield');
    setViewZone(null);
  }

  function rollDice(sides: number) {
    setDiceResult(`d${sides}: ${Math.ceil(Math.random() * sides)}`);
  }

  function untapAll() {
    setState(s => ({ ...s, battlefield: s.battlefield.map(c => ({ ...c, tapped: false })) }));
  }

  function addToken(proto: CardProto) {
    addToZone(inst(proto), 'battlefield', false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#030712' }}>
        <span style={{ color: '#6b7280', fontSize: 14 }}>Loading deck…</span>
      </div>
    );
  }

  const CARD_W = 100;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#030712', color: '#f1f5f9', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', flexShrink: 0,
        background: 'rgba(0,0,0,0.6)', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button onClick={() => navigate('/profile')} style={tbtn('#374151')}>← Back</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginRight: 4 }}>{deckName}</span>
        <div style={{ flex: 1 }} />

        {/* Life total */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setLife(l => l - 1)} style={tbtn('#7f1d1d')}>−</button>
          <span style={{ fontSize: 20, fontWeight: 900, color: life <= 0 ? '#f87171' : '#f1f5f9', minWidth: 36, textAlign: 'center' }}>{life}</span>
          <button onClick={() => setLife(l => l + 1)} style={tbtn('#166534')}>+</button>
          <span style={{ fontSize: 10, color: '#4b5563', marginLeft: 2 }}>LIFE</span>
        </div>

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        <button onClick={() => draw(1)} style={tbtn('#1e3a5f')}>Draw</button>
        <button onClick={() => draw(7)} style={tbtn('#1e3a5f')}>Draw 7</button>
        <button onClick={mulligan} style={tbtn('#374151')}>Mulligan</button>
        <button onClick={untapAll} style={tbtn('#14532d')}>Untap All</button>
        <button onClick={() => setShowTokenModal(true)} style={tbtn('#4a1d96')}>+ Token</button>

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        <button onClick={() => rollDice(6)} style={tbtn('#374151')}>d6</button>
        <button onClick={() => rollDice(20)} style={tbtn('#374151')}>d20</button>
        {diceResult && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', minWidth: 60 }}>{diceResult}</span>
        )}

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
        <button onClick={reset} style={tbtn('#7f1d1d')}>Reset</button>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left sidebar */}
        <div style={{ width: 130, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 12, padding: 10, overflowY: 'auto' }}>

          {/* Command Zone */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Command Zone</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.commandZone.map(card => (
                <PtestCard key={card.instanceId} card={card} size={108}
                  onClick={() => setSelected({ card, zone: 'commandZone' })} />
              ))}
              {state.commandZone.length === 0 && <p style={{ fontSize: 10, color: '#374151' }}>Empty</p>}
            </div>
          </div>

          {/* Library */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Library</p>
            <div onClick={() => draw(1)} style={{ width: 108, height: 150, borderRadius: 8, cursor: 'pointer', background: 'linear-gradient(135deg,#1e1b4b,#0f172a)', border: '1px solid rgba(99,102,241,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 22, opacity: 0.4 }}>🂠</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#818cf8' }}>{state.library.length}</span>
              <span style={{ fontSize: 8, color: '#4b5563' }}>click to draw</span>
            </div>
          </div>

          {/* Graveyard */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Graveyard</p>
            <div onClick={() => setViewZone('graveyard')} style={{ width: 108, height: 60, borderRadius: 8, cursor: 'pointer', background: 'rgba(17,24,39,0.8)', border: '1px dashed rgba(148,163,184,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'column' }}>
              <span style={{ fontSize: 14 }}>🪦</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#9ca3af' }}>{state.graveyard.length}</span>
            </div>
          </div>

          {/* Exile */}
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Exile</p>
            <div onClick={() => setViewZone('exile')} style={{ width: 108, height: 60, borderRadius: 8, cursor: 'pointer', background: 'rgba(17,24,39,0.8)', border: '1px dashed rgba(167,139,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'column' }}>
              <span style={{ fontSize: 14 }}>↗</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#a78bfa' }}>{state.exile.length}</span>
            </div>
          </div>
        </div>

        {/* Battlefield */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {state.battlefield.length === 0 && (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1f2937', fontSize: 14, fontWeight: 600 }}>
                Battlefield — play cards from your hand
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
              {state.battlefield.map(card => (
                <div key={card.instanceId}
                  style={{ display: 'flex', alignItems: 'flex-end', height: card.tapped ? CARD_W + 8 : Math.round(CARD_W * 1.4) + 8 }}>
                  <PtestCard card={card} size={CARD_W}
                    onClick={() => setSelected({ card, zone: 'battlefield' })} />
                </div>
              ))}
            </div>
          </div>

          {/* Hand */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', flexShrink: 0 }}>
            <p style={{ fontSize: 9, fontWeight: 800, color: '#6b7280', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
              Hand ({state.hand.length})
            </p>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {state.hand.length === 0 && <span style={{ fontSize: 11, color: '#374151', padding: '4px 0' }}>Empty — draw cards to fill your hand</span>}
              {state.hand.map(card => (
                <PtestCard key={card.instanceId} card={card} size={78}
                  showTapIndicator={false}
                  onClick={() => setSelected({ card, zone: 'hand' })} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {selected && (
        <CardMenu card={selected.card} zone={selected.zone}
          onAction={action => handleCardAction(selected.card, selected.zone, action)}
          onClose={() => setSelected(null)} />
      )}

      {viewZone && (
        <ZoneViewer
          title={viewZone === 'graveyard' ? 'Graveyard' : 'Exile'}
          cards={state[viewZone] as PCard[]}
          onClose={() => setViewZone(null)}
          onCardClick={card => {
            setViewZone(null);
            setSelected({ card, zone: viewZone! });
          }}
        />
      )}

      {showTokenModal && (
        <TokenModal onClose={() => setShowTokenModal(false)} onCreate={addToken} />
      )}
    </div>
  );
}

// ── Button style helper ────────────────────────────────────────────────────────

function tbtn(bg: string): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
    background: bg + '66', border: `1px solid ${bg}`, color: '#e5e7eb',
    whiteSpace: 'nowrap',
  };
}
