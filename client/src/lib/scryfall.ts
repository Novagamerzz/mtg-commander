const BASE = 'https://api.scryfall.com';

export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    png: string;
  };
  card_faces?: Array<{
    name: string;
    image_uris?: { small: string; normal: string; large: string; png: string };
  }>;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  color_identity?: string[];
}

export function getCardImage(
  card: ScryfallCard,
  size: 'small' | 'normal' | 'large' = 'normal'
): string {
  return card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? '';
}

export async function searchCards(query: string): Promise<ScryfallCard[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `${BASE}/cards/search?q=${encodeURIComponent(query)}&order=name&unique=cards`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []) as ScryfallCard[];
  } catch {
    return [];
  }
}

export async function fetchCardsByName(names: string[]): Promise<ScryfallCard[]> {
  const results: ScryfallCard[] = [];
  for (let i = 0; i < names.length; i += 75) {
    const batch = names.slice(i, i + 75);
    try {
      const res = await fetch(`${BASE}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      results.push(...((data.data ?? []) as ScryfallCard[]));
    } catch {
      continue;
    }
  }
  return results;
}
