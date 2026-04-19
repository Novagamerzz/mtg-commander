import { useEffect, useState } from 'react';
import type { HealthResponse } from '@mtg-commander/types';

type ServerStatus = 'checking' | 'online' | 'offline';

export default function App() {
  const [status, setStatus] = useState<ServerStatus>('checking');
  const [uptime, setUptime] = useState<number | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error('bad response');
        const data: HealthResponse = await res.json();
        setUptime(data.uptime);
        setStatus('online');
      } catch {
        setStatus('offline');
      }
    };

    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = {
    checking: 'text-yellow-400',
    online: 'text-green-400',
    offline: 'text-red-400',
  }[status];

  const statusDot = {
    checking: 'bg-yellow-400 animate-pulse',
    online: 'bg-green-400',
    offline: 'bg-red-500',
  }[status];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-mtg-gold mb-2">
          MTG Commander
        </h1>
        <p className="text-gray-400 text-lg">Multiplayer Commander — foundation ready</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">
          Server Status
        </h2>

        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${statusDot}`} />
          <span className={`text-xl font-semibold capitalize ${statusColor}`}>{status}</span>
        </div>

        {uptime !== null && (
          <p className="text-gray-400 text-sm">
            Uptime: <span className="text-gray-200">{uptime.toFixed(1)}s</span>
          </p>
        )}

        <p className="text-gray-600 text-xs">Polls <code>/api/health</code> every 10 s</p>
      </div>

      <div className="grid grid-cols-5 gap-2 mt-4">
        {(['mtg-white', 'mtg-blue', 'mtg-black', 'mtg-red', 'mtg-green'] as const).map(
          (color) => (
            <div
              key={color}
              className={`w-8 h-8 rounded-full bg-${color} border border-gray-700`}
              title={color}
            />
          )
        )}
      </div>
    </div>
  );
}
