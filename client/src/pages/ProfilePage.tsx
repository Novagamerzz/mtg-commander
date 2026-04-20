import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface Deck {
  id: string;
  name: string;
  commander: string;
  created_at: string;
}

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('decks')
      .select('id, name, commander, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDecks((data as Deck[]) ?? []);
        setDecksLoading(false);
      });
  }, [user]);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const username = user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Commander';

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-mtg-gold">MTG Commander</h1>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-gray-200 transition"
        >
          Sign out
        </button>
      </div>

      {/* Profile card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-mtg-gold/20 border border-mtg-gold/40 flex items-center justify-center text-2xl font-bold text-mtg-gold select-none">
          {username[0].toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-100">{username}</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
      </div>

      {/* Saved decks */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-200">Saved Decks</h2>
          <span className="text-xs text-gray-600 bg-gray-800 px-2 py-1 rounded-full">
            {decks.length} deck{decks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {decksLoading ? (
          <div className="text-gray-500 animate-pulse text-sm">Loading decks…</div>
        ) : decks.length === 0 ? (
          <EmptyDecks />
        ) : (
          <ul className="flex flex-col gap-3">
            {decks.map((deck) => (
              <li
                key={deck.id}
                className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-100">{deck.name}</p>
                  <p className="text-sm text-gray-500">
                    Commander: <span className="text-gray-300">{deck.commander}</span>
                  </p>
                </div>
                <p className="text-xs text-gray-600">
                  {new Date(deck.created_at).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyDecks() {
  return (
    <div className="bg-gray-900 border border-dashed border-gray-700 rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
      <div className="text-4xl opacity-50">🃏</div>
      <p className="text-gray-400 font-medium">No decks saved yet</p>
      <p className="text-gray-600 text-sm max-w-xs">
        Build and save your Commander decks here. They'll appear once you create one.
      </p>
    </div>
  );
}
