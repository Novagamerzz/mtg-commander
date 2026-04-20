import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { socket } from '../lib/socket';
import type { Room } from '../lib/types';

export default function LobbyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const playerName = user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Player';

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.emit('lobby:subscribe');
    socket.on('lobby:rooms', setRooms);

    socket.once('room:updated', (room) => {
      navigate(`/room/${room.id}`);
    });

    return () => {
      socket.off('lobby:rooms', setRooms);
      socket.off('room:updated');
    };
  }, [navigate]);

  function createRoom() {
    setCreating(true);
    socket.once('room:updated', (room) => {
      navigate(`/room/${room.id}`);
    });
    socket.emit('lobby:create_room', { playerName, userId: user!.id });
  }

  function joinRoom(roomId: string) {
    setJoiningId(roomId);
    socket.once('room:updated', (room) => {
      navigate(`/room/${room.id}`);
    });
    socket.emit('lobby:join_room', { roomId, playerName, userId: user!.id });
  }

  return (
    <div className="min-h-screen p-6 max-w-3xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-yellow-600">Game Lobby</h1>
          <p className="text-gray-500 text-sm mt-0.5">Playing as <span className="text-gray-300">{playerName}</span></p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/profile')}
            className="text-sm text-gray-500 hover:text-gray-200 transition"
          >
            ← Profile
          </button>
          <button
            onClick={createRoom}
            disabled={creating}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-gray-950
                       font-semibold text-sm px-4 py-2 rounded-lg transition"
          >
            {creating ? 'Creating…' : '+ Create Game'}
          </button>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="border border-dashed border-gray-800 rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl opacity-40">🎲</span>
          <p className="text-gray-400 font-medium">No open games</p>
          <p className="text-gray-600 text-sm">Create a game and invite friends to join.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-100 truncate">
                  {room.hostName}'s Game
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-2.5 h-2.5 rounded-full ${
                          i < room.players.length ? 'bg-green-500' : 'bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-gray-500">
                    {room.players.length} / 4 players
                  </span>
                  <span className="text-xs text-gray-700">
                    {room.players.filter((p) => p.ready).length} ready
                  </span>
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
                onClick={() => joinRoom(room.id)}
                disabled={joiningId === room.id || room.players.length >= 4}
                className="shrink-0 border border-gray-700 hover:border-yellow-700 text-gray-300 hover:text-yellow-400
                           disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                {joiningId === room.id ? 'Joining…' : room.players.length >= 4 ? 'Full' : 'Join'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
