import { useState, type FormEvent } from 'react';
import { fetchCardsByName, getCardImage, type ScryfallCard } from '../../lib/scryfall';

interface ParsedLine {
  qty: number;
  name: string;
}

function parseDeckList(text: string): ParsedLine[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      // Skip section headers like "// Creatures" or "# Sideboard"
      if (line.startsWith('//') || line.startsWith('#')) return [];
      const match = line.match(/^(\d+)x?\s+(.+?)(?:\s+\(.*\))?(?:\s+\d+)?$/);
      if (!match) return [];
      return [{ qty: parseInt(match[1], 10), name: match[2].trim() }];
    });
}

export interface ImportedCard {
  card: ScryfallCard;
  quantity: number;
}

interface Props {
  onImport: (cards: ImportedCard[]) => void;
  onClose: () => void;
}

export default function ImportModal({ onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = parseDeckList(text);
    if (parsed.length === 0) {
      setError('No valid card lines found. Expected format: "1 Lightning Bolt"');
      return;
    }
    setLoading(true);
    const names = [...new Set(parsed.map((p) => p.name))];
    const cards = await fetchCardsByName(names);
    setLoading(false);

    if (cards.length === 0) {
      setError('Could not find any cards. Check card names and try again.');
      return;
    }

    const cardMap = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
    const notFound = parsed.filter((p) => !cardMap.has(p.name.toLowerCase())).map((p) => p.name);
    if (notFound.length > 0) {
      setError(`Could not find: ${notFound.slice(0, 5).join(', ')}${notFound.length > 5 ? ` +${notFound.length - 5} more` : ''}`);
    }

    const result: ImportedCard[] = [];
    for (const { qty, name } of parsed) {
      const card = cardMap.get(name.toLowerCase());
      if (card) result.push({ card, quantity: qty });
    }
    onImport(result);
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Import Decklist</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">
              Paste your decklist
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 text-sm
                         font-mono placeholder-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-700
                         focus:border-transparent resize-none h-64 transition"
              placeholder={`1 Sol Ring\n1 Atraxa, Praetors' Voice\n4 Forest\n1 Lightning Bolt`}
              autoFocus
            />
          </div>

          <p className="text-xs text-gray-600">
            Format: <code className="text-gray-500">1 Card Name</code> — one card per line.
            Section headers (// Creatures) are ignored.
          </p>

          {error && (
            <p className="text-yellow-400 text-sm bg-yellow-950/30 border border-yellow-900/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg border border-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="text-sm bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed
                         text-gray-950 font-semibold px-4 py-2 rounded-lg transition"
            >
              {loading ? 'Looking up cards…' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
