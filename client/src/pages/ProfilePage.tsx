import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Deck {
  id: string;
  name: string;
  commander: string | null;
  commander_image_uri: string | null;
  created_at: string;
  cardCount?: number;
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadDecks();
  }, [user]);

  async function loadDecks() {
    setDecksLoading(true);
    const { data: deckRows } = await supabase
      .from('decks')
      .select('id, name, commander, commander_image_uri, created_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (!deckRows) {
      setDecksLoading(false);
      return;
    }

    // Fetch card counts for all decks in one query
    const deckIds = deckRows.map((d) => d.id);
    const { data: cardRows } = deckIds.length
      ? await supabase
          .from('deck_cards')
          .select('deck_id, quantity')
          .in('deck_id', deckIds)
      : { data: [] };

    const countMap = new Map<string, number>();
    for (const row of cardRows ?? []) {
      countMap.set(row.deck_id, (countMap.get(row.deck_id) ?? 0) + row.quantity);
    }

    setDecks(
      deckRows.map((d) => ({
        ...d,
        cardCount: countMap.get(d.id) ?? 0,
      }))
    );
    setDecksLoading(false);
  }

  async function createNewDeck() {
    if (!user) return;
    setCreating(true);
    const { data: deck } = await supabase
      .from('decks')
      .insert({ user_id: user.id, name: 'New Deck' })
      .select()
      .single();
    setCreating(false);
    if (deck) navigate(`/deck-builder/${deck.id}`);
  }

  async function deleteDeck(deckId: string) {
    setDeletingId(deckId);
    await supabase.from('decks').delete().eq('id', deckId);
    setDecks((prev) => prev.filter((d) => d.id !== deckId));
    setDeletingId(null);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const username = user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Commander';

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yellow-600">MTG Commander</h1>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-gray-200 transition"
        >
          Sign out
        </button>
      </div>

      {/* Profile card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold
                        text-yellow-600 bg-yellow-950/40 border border-yellow-800/40 select-none shrink-0"
        >
          {username[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-100">{username}</p>
          <p className="text-sm text-gray-500 truncate">{user?.email}</p>
        </div>
      </div>

      {/* Decks section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-200">
            My Decks
            {!decksLoading && (
              <span className="text-sm font-normal text-gray-600 ml-2">{decks.length}</span>
            )}
          </h2>

          <button
            onClick={createNewDeck}
            disabled={creating}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-gray-950
                       font-semibold text-sm px-4 py-2 rounded-lg transition"
          >
            {creating ? 'Creating…' : '+ New Deck'}
          </button>
        </div>

        {decksLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 bg-gray-900 rounded-2xl border border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : decks.length === 0 ? (
          <EmptyState onCreate={createNewDeck} creating={creating} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {decks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                deleting={deletingId === deck.id}
                onEdit={() => navigate(`/deck-builder/${deck.id}`)}
                onDelete={() => deleteDeck(deck.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeckCard({
  deck, deleting, onEdit, onDelete,
}: {
  deck: Deck;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isComplete = deck.cardCount === 100;
  const countColor = isComplete
    ? 'text-green-400'
    : (deck.cardCount ?? 0) > 0
    ? 'text-yellow-500'
    : 'text-gray-600';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden flex flex-col group hover:border-gray-700 transition">
      {/* Commander art banner */}
      <div className="relative h-24 bg-gray-800 overflow-hidden shrink-0">
        {deck.commander_image_uri ? (
          <img
            src={deck.commander_image_uri}
            alt={deck.commander ?? ''}
            className="w-full h-full object-cover object-top scale-110 blur-[1px] opacity-70 group-hover:opacity-90 transition"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700 text-4xl select-none">
            🃏
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <h3 className="font-semibold text-gray-100 truncate">{deck.name}</h3>
          {deck.commander ? (
            <p className="text-xs text-gray-500 truncate mt-0.5">⚜ {deck.commander}</p>
          ) : (
            <p className="text-xs text-gray-700 mt-0.5 italic">No commander set</p>
          )}
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className={`font-mono ${countColor}`}>
            {deck.cardCount ?? 0} / 100 cards
          </span>
          <span className="text-gray-700">
            {new Date(deck.created_at).toLocaleDateString()}
          </span>
        </div>

        <div className="flex gap-2 mt-auto">
          <button
            onClick={onEdit}
            className="flex-1 text-sm text-gray-200 hover:text-white border border-gray-700
                       hover:border-gray-500 rounded-lg py-1.5 transition font-medium"
          >
            Edit
          </button>

          {confirmDelete ? (
            <div className="flex gap-1">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded-lg border border-gray-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 px-2 py-1.5
                           rounded-lg border border-red-900/50 transition"
              >
                {deleting ? '…' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-gray-600 hover:text-red-400 border border-gray-800
                         hover:border-red-900/50 rounded-lg px-3 py-1.5 transition"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div
      className="border border-dashed border-gray-800 rounded-2xl p-12 flex flex-col
                    items-center gap-4 text-center"
    >
      <span className="text-5xl opacity-40">🃏</span>
      <div>
        <p className="text-gray-400 font-medium">No decks yet</p>
        <p className="text-gray-600 text-sm mt-1">
          Build your first Commander deck to get started.
        </p>
      </div>
      <button
        onClick={onCreate}
        disabled={creating}
        className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-gray-950
                   font-semibold text-sm px-5 py-2 rounded-lg transition mt-2"
      >
        {creating ? 'Creating…' : '+ New Deck'}
      </button>
    </div>
  );
}
