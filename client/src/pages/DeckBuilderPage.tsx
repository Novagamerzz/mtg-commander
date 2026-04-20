import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { searchCards, getCardImage, type ScryfallCard } from '../lib/scryfall';
import { useDebounce } from '../hooks/useDebounce';
import ImportModal, { type ImportedCard } from '../components/deck/ImportModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeckEntry {
  scryfallId: string;
  cardName: string;
  quantity: number;
  typeLine: string;
  imageUri: string;
  isCommander: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GROUP_ORDER = [
  'Creatures', 'Planeswalkers', 'Instants',
  'Sorceries', 'Enchantments', 'Artifacts', 'Lands', 'Other',
] as const;

function getGroup(typeLine: string): string {
  if (typeLine.includes('Creature')) return 'Creatures';
  if (typeLine.includes('Planeswalker')) return 'Planeswalkers';
  if (typeLine.includes('Instant')) return 'Instants';
  if (typeLine.includes('Sorcery')) return 'Sorceries';
  if (typeLine.includes('Enchantment')) return 'Enchantments';
  if (typeLine.includes('Artifact')) return 'Artifacts';
  if (typeLine.includes('Land')) return 'Lands';
  return 'Other';
}

function entryFromCard(card: ScryfallCard): DeckEntry {
  return {
    scryfallId: card.id,
    cardName: card.name,
    quantity: 1,
    typeLine: card.type_line,
    imageUri: getCardImage(card),
    isCommander: false,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface HoverProps {
  onHover: (uri: string) => void;
  onHoverEnd: () => void;
}

function CardResultRow({
  card, inDeck, isCommander, onAdd, onSetCommander, onHover, onHoverEnd,
}: {
  card: ScryfallCard;
  inDeck: boolean;
  isCommander: boolean;
  onAdd: () => void;
  onSetCommander: () => void;
} & HoverProps) {
  const uri = getCardImage(card);
  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/60 group hover:bg-gray-900/80 transition"
      onMouseEnter={() => uri && onHover(uri)}
      onMouseLeave={onHoverEnd}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-100 truncate">{card.name}</p>
        <p className="text-xs text-gray-500 truncate">{card.type_line}</p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {inDeck && !isCommander && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-0.5" />
        )}
        {isCommander && (
          <span className="text-xs text-yellow-500 mr-1" title="Commander">⚜</span>
        )}
        <button
          onClick={onSetCommander}
          className="opacity-0 group-hover:opacity-100 text-xs text-yellow-600 hover:text-yellow-400
                     px-1.5 py-0.5 rounded border border-yellow-800/50 transition"
          title="Set as Commander"
        >
          ⚜
        </button>
        <button
          onClick={onAdd}
          className="opacity-0 group-hover:opacity-100 text-sm text-green-400 hover:text-green-300
                     w-6 h-6 flex items-center justify-center rounded border border-green-800/50 transition"
          title="Add to deck"
        >
          +
        </button>
      </div>
    </div>
  );
}

function DeckCardRow({
  entry, isCommanderSlot, onAdjust, onRemove, onSetCommander, onHover, onHoverEnd,
}: {
  entry: DeckEntry;
  isCommanderSlot: boolean;
  onAdjust: (delta: number) => void;
  onRemove: () => void;
  onSetCommander: () => void;
} & HoverProps) {
  return (
    <div
      className="flex items-center gap-2 py-1 px-1 rounded-lg group hover:bg-gray-800/40 transition"
      onMouseEnter={() => entry.imageUri && onHover(entry.imageUri)}
      onMouseLeave={onHoverEnd}
    >
      {isCommanderSlot ? (
        <span className="text-yellow-500 text-xs w-14 text-center shrink-0">⚜ CMD</span>
      ) : (
        <div className="flex items-center shrink-0 gap-0.5">
          <button
            onClick={() => onAdjust(-1)}
            className="text-gray-600 hover:text-gray-200 w-5 h-5 flex items-center justify-center rounded transition text-base leading-none"
          >
            −
          </button>
          <span className="text-sm text-gray-300 w-5 text-center tabular-nums">{entry.quantity}</span>
          <button
            onClick={() => onAdjust(1)}
            className="text-gray-600 hover:text-gray-200 w-5 h-5 flex items-center justify-center rounded transition text-base leading-none"
          >
            +
          </button>
        </div>
      )}

      <span className="flex-1 text-sm text-gray-200 truncate">{entry.cardName}</span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
        {!isCommanderSlot && (
          <button
            onClick={onSetCommander}
            className="text-xs text-yellow-600/70 hover:text-yellow-400 transition"
            title="Set as Commander"
          >
            ⚜
          </button>
        )}
        <button
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition text-base leading-none"
          title="Remove"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeckBuilderPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const [deckName, setDeckName] = useState('New Deck');
  const [entries, setEntries] = useState<DeckEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedLabel, setSavedLabel] = useState(false);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedQuery = useDebounce(query, 380);

  const [hoverUri, setHoverUri] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const [showImport, setShowImport] = useState(false);

  // Load existing deck
  useEffect(() => {
    if (!deckId) return;
    Promise.all([
      supabase.from('decks').select('*').eq('id', deckId).single(),
      supabase.from('deck_cards').select('*').eq('deck_id', deckId),
    ]).then(([{ data: deck }, { data: cards }]) => {
      if (deck) setDeckName(deck.name ?? 'New Deck');
      if (cards) {
        setEntries(
          cards.map((c) => ({
            scryfallId: c.scryfall_id,
            cardName: c.card_name,
            quantity: c.quantity ?? 1,
            typeLine: c.type_line ?? '',
            imageUri: c.image_uri ?? '',
            isCommander: c.is_commander ?? false,
          }))
        );
      }
      setPageLoading(false);
    });
  }, [deckId]);

  // Scryfall search
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchCards(debouncedQuery).then((results) => {
      setSearchResults(results.slice(0, 25));
      setSearching(false);
    });
  }, [debouncedQuery]);

  // ── Deck mutation helpers ────────────────────────────────────────────────────

  function addCard(card: ScryfallCard) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.scryfallId === card.id);
      if (idx !== -1) {
        return prev.map((e, i) =>
          i === idx && !e.isCommander ? { ...e, quantity: e.quantity + 1 } : e
        );
      }
      return [...prev, entryFromCard(card)];
    });
  }

  function setCommander(card: ScryfallCard) {
    setEntries((prev) => {
      const exists = prev.some((e) => e.scryfallId === card.id);
      const base = exists ? prev : [...prev, entryFromCard(card)];
      return base.map((e) => ({
        ...e,
        isCommander: e.scryfallId === card.id,
        quantity: e.scryfallId === card.id ? 1 : e.quantity,
      }));
    });
  }

  function setCommanderById(scryfallId: string) {
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        isCommander: e.scryfallId === scryfallId,
        quantity: e.scryfallId === scryfallId ? 1 : e.quantity,
      }))
    );
  }

  function adjustQuantity(scryfallId: string, delta: number) {
    setEntries((prev) =>
      prev.flatMap((e) => {
        if (e.scryfallId !== scryfallId || e.isCommander) return [e];
        const qty = e.quantity + delta;
        return qty <= 0 ? [] : [{ ...e, quantity: qty }];
      })
    );
  }

  function removeCard(scryfallId: string) {
    setEntries((prev) => prev.filter((e) => e.scryfallId !== scryfallId));
  }

  function handleImport(imported: ImportedCard[]) {
    setEntries((prev) => {
      const updated = [...prev];
      for (const { card, quantity } of imported) {
        const idx = updated.findIndex((e) => e.scryfallId === card.id);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + quantity };
        } else {
          updated.push({ ...entryFromCard(card), quantity });
        }
      }
      return updated;
    });
    setShowImport(false);
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function saveDeck() {
    if (!deckId) return;
    setSaving(true);
    const commander = entries.find((e) => e.isCommander);

    await supabase
      .from('decks')
      .update({
        name: deckName,
        commander: commander?.cardName ?? null,
        commander_scryfall_id: commander?.scryfallId ?? null,
        commander_image_uri: commander?.imageUri ?? null,
      })
      .eq('id', deckId);

    await supabase.from('deck_cards').delete().eq('deck_id', deckId);

    if (entries.length > 0) {
      await supabase.from('deck_cards').insert(
        entries.map((e) => ({
          deck_id: deckId,
          scryfall_id: e.scryfallId,
          card_name: e.cardName,
          quantity: e.quantity,
          type_line: e.typeLine,
          image_uri: e.imageUri,
          is_commander: e.isCommander,
        }))
      );
    }

    setSaving(false);
    setSavedLabel(true);
    setTimeout(() => setSavedLabel(false), 2000);
  }

  // ── Derived state ─────────────────────────────────────────────────────────────

  const commander = entries.find((e) => e.isCommander);
  const nonCommanderEntries = entries.filter((e) => !e.isCommander);
  const totalCards =
    nonCommanderEntries.reduce((s, e) => s + e.quantity, 0) + (commander ? 1 : 0);
  const isValid = totalCards === 100;
  const cardIds = new Set(entries.map((e) => e.scryfallId));

  const groups = GROUP_ORDER.map((label) => ({
    label,
    entries: nonCommanderEntries.filter((e) => getGroup(e.typeLine) === label),
  })).filter((g) => g.entries.length > 0);

  // ── Hover image position clamping ─────────────────────────────────────────────

  const IMG_W = 220;
  const IMG_H = 310;
  const hoverLeft =
    hoverPos.x + IMG_W + 24 > window.innerWidth
      ? hoverPos.x - IMG_W - 8
      : hoverPos.x + 16;
  const hoverTop = Math.max(8, Math.min(hoverPos.y - 60, window.innerHeight - IMG_H - 8));

  if (pageLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-500 animate-pulse">
        Loading deck…
      </div>
    );
  }

  return (
    <div
      className="h-screen flex flex-col bg-gray-950 overflow-hidden"
      onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
    >
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur shrink-0">
        <button
          onClick={() => navigate('/profile')}
          className="text-gray-500 hover:text-gray-200 transition text-sm shrink-0"
        >
          ← Profile
        </button>

        <input
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          className="flex-1 bg-transparent text-gray-100 text-lg font-bold focus:outline-none
                     border-b border-transparent focus:border-gray-600 transition max-w-xs"
          placeholder="Deck Name"
        />

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowImport(true)}
            className="text-sm text-gray-400 hover:text-gray-200 border border-gray-700 px-3 py-1.5 rounded-lg transition"
          >
            Import text
          </button>

          <div
            className={`text-sm font-mono px-3 py-1.5 rounded-lg border transition ${
              isValid
                ? 'text-green-400 border-green-900 bg-green-950/30'
                : totalCards > 100
                ? 'text-red-400 border-red-900 bg-red-950/30'
                : 'text-yellow-400 border-yellow-900 bg-yellow-950/20'
            }`}
          >
            {totalCards} / 100
          </div>

          <button
            onClick={saveDeck}
            disabled={saving}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed
                       text-gray-950 font-semibold px-4 py-1.5 rounded-lg text-sm transition"
          >
            {saving ? 'Saving…' : savedLabel ? '✓ Saved' : 'Save Deck'}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Search panel */}
        <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
          <div className="p-3 border-b border-gray-800">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Scryfall…"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-700
                         focus:border-transparent transition"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {searching && (
              <p className="text-gray-600 text-xs p-3 animate-pulse">Searching…</p>
            )}

            {!searching &&
              searchResults.map((card) => (
                <CardResultRow
                  key={card.id}
                  card={card}
                  inDeck={cardIds.has(card.id)}
                  isCommander={commander?.scryfallId === card.id}
                  onAdd={() => addCard(card)}
                  onSetCommander={() => setCommander(card)}
                  onHover={setHoverUri}
                  onHoverEnd={() => setHoverUri(null)}
                />
              ))}

            {!searching && debouncedQuery && searchResults.length === 0 && (
              <p className="text-gray-600 text-xs p-3">No results for "{debouncedQuery}"</p>
            )}

            {!debouncedQuery && (
              <p className="text-gray-700 text-xs p-3">Type to search Scryfall…</p>
            )}
          </div>
        </div>

        {/* Right: Deck list */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Commander slot */}
          <section className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-yellow-600/80 mb-2">
              Commander
            </h2>
            {commander ? (
              <DeckCardRow
                entry={commander}
                isCommanderSlot
                onAdjust={() => {}}
                onRemove={() => removeCard(commander.scryfallId)}
                onSetCommander={() => {}}
                onHover={setHoverUri}
                onHoverEnd={() => setHoverUri(null)}
              />
            ) : (
              <div className="border border-dashed border-gray-800 rounded-lg px-3 py-2.5 text-gray-700 text-xs">
                Search a card and click ⚜ to set your Commander
              </div>
            )}
          </section>

          {/* Grouped card sections */}
          {groups.map(({ label, entries: groupEntries }) => (
            <section key={label} className="mb-5">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
                {label}
                <span className="text-gray-700 font-normal normal-case tracking-normal">
                  ({groupEntries.reduce((s, e) => s + e.quantity, 0)})
                </span>
              </h2>
              <div className="flex flex-col gap-0.5">
                {groupEntries.map((entry) => (
                  <DeckCardRow
                    key={entry.scryfallId}
                    entry={entry}
                    isCommanderSlot={false}
                    onAdjust={(d) => adjustQuantity(entry.scryfallId, d)}
                    onRemove={() => removeCard(entry.scryfallId)}
                    onSetCommander={() => setCommanderById(entry.scryfallId)}
                    onHover={setHoverUri}
                    onHoverEnd={() => setHoverUri(null)}
                  />
                ))}
              </div>
            </section>
          ))}

          {entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-gray-700 gap-3">
              <span className="text-5xl">🃏</span>
              <p className="text-sm">Search for cards on the left to start building.</p>
            </div>
          )}
        </div>
      </div>

      {/* Hover card image */}
      {hoverUri && (
        <div
          style={{
            position: 'fixed',
            left: hoverLeft,
            top: hoverTop,
            width: IMG_W,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <img
            src={hoverUri}
            className="w-full rounded-xl shadow-2xl border border-gray-700/50"
            alt=""
          />
        </div>
      )}

      {showImport && (
        <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
