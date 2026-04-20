import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { socket } from '../lib/socket';
import { fetchCardsByIds } from '../lib/scryfall';
import type { Room, DeckCardData } from '../lib/types';

interface SavedDeck {
  id: string;
  name: string;
  commander: string | null;
}

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState<Room | null>(null);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  const playerName = user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Player';
  const mySocketId = socket.id ?? '';
  const isHost = room?.hostSocketId === mySocketId;
  const me = room?.players.find((p) => p.socketId === mySocketId);
  const allReady = room ? room.players.length >= 2 && room.players.every((p) => p.ready) : false;

  // Load saved decks
  useEffect(() => {
    if (!user) return;
    supabase
      .from('decks')
      .select('id, name, commander')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setSavedDecks((data as SavedDeck[]) ?? []));
  }, [user]);

  // Socket setup
  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.on('room:updated', setRoom);
    socket.on('room:error', (msg) => setError(msg));

    // Navigate to game board when game starts
    socket.on('game:state', () => {
      navigate(`/game/${roomId}`);
    });

    return () => {
      socket.off('room:updated', setRoom);
      socket.off('room:error');
      socket.off('game:state');
    };
  }, [roomId, navigate]);

  async function selectDeck(deckId: string) {
    if (!deckId) return;
    setSelectedDeckId(deckId);
    setLoadingDeck(true);
    setError('');

    const [{ data: deck }, { data: cards }] = await Promise.all([
      supabase.from('decks').select('id, name').eq('id', deckId).single(),
      supabase.from('deck_cards').select('*').eq('deck_id', deckId),
    ]);

    setLoadingDeck(false);

    if (!deck || !cards || cards.length === 0) {
      setError('Deck has no cards. Add cards in the deck builder first.');
      return;
    }

    // Fetch oracle_text from Scryfall so the server can enforce Flash timing
    const uniqueIds = [...new Set(cards.map((c) => c.scryfall_id))];
    const scryfallData = await fetchCardsByIds(uniqueIds);
    const oracleMap = new Map(scryfallData.map((c) => [c.id, c.oracle_text ?? '']));

    const deckCards: DeckCardData[] = cards.map((c) => ({
      scryfallId: c.scryfall_id,
      cardName: c.card_name,
      imageUri: c.image_uri ?? '',
      typeLine: c.type_line ?? '',
      oracleText: oracleMap.get(c.scryfall_id) ?? '',
      quantity: c.quantity ?? 1,
      isCommander: c.is_commander ?? false,
    }));

    socket.emit('room:select_deck', {
      deckId: deck.id,
      deckName: deck.name,
      cards: deckCards,
    });
  }

  function startGame() {
    setStarting(true);
    socket.emit('room:start_game');
  }

  function leaveRoom() {
    socket.emit('room:leave');
    navigate('/lobby');
  }

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-yellow-600">
            {room?.hostName ? `${room.hostName}'s Game` : 'Game Room'}
          </h1>
          <p className="text-gray-600 text-xs mt-0.5 font-mono truncate">{roomId}</p>
        </div>
        <button
          onClick={leaveRoom}
          className="text-sm text-gray-500 hover:text-red-400 transition"
        >
          Leave
        </button>
      </div>

      {/* Players */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400">
            Players ({room?.players.length ?? 0} / 4)
          </h2>
          <span className="text-xs text-gray-600">Waiting for host to start…</span>
        </div>

        {(room?.players ?? []).map((player, i) => (
          <div
            key={player.socketId}
            className="px-5 py-3.5 flex items-center gap-3 border-b border-gray-800/60 last:border-0"
          >
            <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-100">{player.playerName}</span>
                {player.socketId === room?.hostSocketId && (
                  <span className="text-xs text-yellow-600 bg-yellow-950/40 px-1.5 py-0.5 rounded">Host</span>
                )}
                {player.socketId === mySocketId && (
                  <span className="text-xs text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded">You</span>
                )}
              </div>
              {player.deckName ? (
                <p className="text-xs text-green-500 mt-0.5">✓ {player.deckName}</p>
              ) : (
                <p className="text-xs text-gray-600 mt-0.5">No deck selected</p>
              )}
            </div>
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${player.ready ? 'bg-green-500' : 'bg-gray-700'}`} />
          </div>
        ))}

        {/* Empty slots */}
        {Array.from({ length: Math.max(0, 4 - (room?.players.length ?? 0)) }).map((_, i) => (
          <div key={i} className="px-5 py-3.5 flex items-center gap-3 border-b border-gray-800/40 last:border-0 opacity-30">
            <div className="w-8 h-8 rounded-full bg-gray-900 border border-dashed border-gray-700 shrink-0" />
            <span className="text-sm text-gray-600 italic">Waiting for player…</span>
          </div>
        ))}
      </div>

      {/* Deck selection */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-gray-400">Your Deck</h2>

        {savedDecks.length === 0 ? (
          <p className="text-sm text-gray-600">
            No decks saved.{' '}
            <button
              onClick={() => navigate('/profile')}
              className="text-yellow-600 hover:underline"
            >
              Build one first
            </button>
            .
          </p>
        ) : (
          <select
            value={selectedDeckId}
            onChange={(e) => selectDeck(e.target.value)}
            disabled={loadingDeck}
            className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 text-sm
                       focus:outline-none focus:ring-2 focus:ring-yellow-700 transition w-full"
          >
            <option value="">— Select a deck —</option>
            {savedDecks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.commander ? ` (${d.commander})` : ''}
              </option>
            ))}
          </select>
        )}

        {loadingDeck && (
          <p className="text-xs text-gray-500 animate-pulse">Loading deck cards…</p>
        )}

        {me?.ready && (
          <p className="text-xs text-green-500">✓ Deck locked in: {me.deckName}</p>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/30 rounded px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {/* Start game (host only) */}
      {isHost && (
        <div className="flex flex-col gap-2">
          <button
            onClick={startGame}
            disabled={!allReady || starting}
            className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed
                       text-gray-950 font-bold py-3 rounded-xl text-base transition"
          >
            {starting ? 'Starting…' : allReady ? 'Start Game' : `Waiting for players (${room?.players.filter(p => p.ready).length ?? 0}/${room?.players.length ?? 0} ready)`}
          </button>
          {!allReady && room && room.players.length < 2 && (
            <p className="text-xs text-center text-gray-600">Need at least 2 players.</p>
          )}
        </div>
      )}

      {!isHost && (
        <p className="text-center text-sm text-gray-600">
          Waiting for the host to start the game…
        </p>
      )}
    </div>
  );
}
