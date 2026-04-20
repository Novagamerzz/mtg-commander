import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { socket } from '../lib/socket';
import type { Room } from '../lib/types';

export default function LobbyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Create-room modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createPassword, setCreatePassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Join password prompt state
  const [joinPrompt, setJoinPrompt] = useState<{ roomId: string } | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const joinInputRef = useRef<HTMLInputElement>(null);

  const playerName = user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Player';

  useEffect(() => {
    if (!socket.connected) socket.connect();
    socket.emit('lobby:subscribe');
    socket.on('lobby:rooms', setRooms);
    socket.once('room:updated', (room) => navigate(`/room/${room.id}`));
    return () => {
      socket.off('lobby:rooms', setRooms);
      socket.off('room:updated');
    };
  }, [navigate]);

  useEffect(() => {
    if (joinPrompt) setTimeout(() => joinInputRef.current?.focus(), 50);
  }, [joinPrompt]);

  function createRoom() {
    setCreating(true);
    setShowCreate(false);
    socket.once('room:updated', (room) => navigate(`/room/${room.id}`));
    socket.emit('lobby:create_room', {
      playerName, userId: user!.id,
      password: createPassword.trim() || undefined,
    });
  }

  function joinRoom(roomId: string, password?: string) {
    setJoiningId(roomId);
    setJoinPrompt(null);
    socket.once('room:updated', (room) => navigate(`/room/${room.id}`));
    socket.emit('lobby:join_room', { roomId, playerName, userId: user!.id, password });
  }

  function handleJoinClick(room: Room) {
    if (room.hasPassword) {
      setJoinPassword('');
      setJoinPrompt({ roomId: room.id });
    } else {
      joinRoom(room.id);
    }
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-yellow-600">Game Lobby</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Playing as <span className="text-gray-300">{playerName}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/profile')} className="text-sm text-gray-500 hover:text-gray-200 transition">
            ← Profile
          </button>
          <button
            onClick={() => { setCreatePassword(''); setShowCreate(true); }}
            disabled={creating}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-gray-950 font-semibold text-sm px-4 py-2 rounded-lg transition"
          >
            {creating ? 'Creating…' : '+ Create Game'}
          </button>
        </div>
      </div>

      {/* Create-room modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}>
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-100">New Game</h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                Password <span className="text-gray-700 font-normal normal-case">(optional — leave blank for open room)</span>
              </label>
              <input
                autoFocus
                type="text"
                placeholder="e.g. commander123"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createRoom(); if (e.key === 'Escape') setShowCreate(false); }}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-yellow-700"
              />
              {createPassword.trim() && (
                <p className="text-xs text-yellow-600">🔒 Room will be password protected</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={createRoom}
                className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-gray-950 font-bold text-sm py-2 rounded-lg transition"
              >
                Create Room
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 border border-gray-700 text-gray-400 hover:text-gray-100 text-sm py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join password prompt */}
      {joinPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setJoinPrompt(null)}>
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="text-xl">🔒</span>
              <h2 className="text-lg font-bold text-gray-100">Password Required</h2>
            </div>
            <input
              ref={joinInputRef}
              type="text"
              placeholder="Enter room password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') joinRoom(joinPrompt.roomId, joinPassword);
                if (e.key === 'Escape') setJoinPrompt(null);
              }}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-yellow-700"
            />
            <div className="flex gap-3">
              <button
                onClick={() => joinRoom(joinPrompt.roomId, joinPassword)}
                disabled={!joinPassword.trim()}
                className="flex-1 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 text-gray-950 font-bold text-sm py-2 rounded-lg transition"
              >
                Join
              </button>
              <button
                onClick={() => setJoinPrompt(null)}
                className="flex-1 border border-gray-700 text-gray-400 hover:text-gray-100 text-sm py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room list */}
      {rooms.length === 0 ? (
        <div className="border border-dashed border-gray-800 rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl opacity-40">🎲</span>
          <p className="text-gray-400 font-medium">No open games</p>
          <p className="text-gray-600 text-sm">Create a game and invite friends to join.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rooms.map((room) => (
            <div key={room.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-100 truncate">{room.hostName}'s Game</p>
                  {room.hasPassword && <span className="text-sm text-yellow-600" title="Password protected">🔒</span>}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < room.players.length ? 'bg-green-500' : 'bg-gray-700'}`} />
                    ))}
                  </div>
                  <span className="text-sm text-gray-500">{room.players.length} / 4 players</span>
                  <span className="text-xs text-gray-700">{room.players.filter((p) => p.ready).length} ready</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {room.players.map((p) => (
                    <span key={p.socketId} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      {p.playerName} {p.ready ? '✓' : ''}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => handleJoinClick(room)}
                disabled={joiningId === room.id || room.players.length >= 4}
                className="shrink-0 border border-gray-700 hover:border-yellow-700 text-gray-300 hover:text-yellow-400
                           disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                {joiningId === room.id ? 'Joining…' : room.players.length >= 4 ? 'Full' : room.hasPassword ? '🔒 Join' : 'Join'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
