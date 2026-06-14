// Normalizes free-text job descriptions into a canonical slug for deduplication.
// "Replace Front Brake Pads" and "Brake Pads - Front (New)" both → "brake-front-pads"

const FILLER = new Set([
  'replace', 'replacement', 'repair', 'fix', 'change', 'new', 'install',
  'installation', 'service', 'check', 'inspect', 'inspection', 'remove',
  'removal', 'and', 'the', 'a', 'an', 'with', 'for', 'of', 'to', 'or',
  'in', 'on', 'at', 'by', 'up', 'do', 'perform', 'performed', 'complete',
  'completed', 'left', 'right', 'both', 'sides', 'side', 'per',
]);

export function slugifyJob(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .split(/\s+/)
    .filter(w => w.length > 1 && !FILLER.has(w));

  if (words.length === 0) {
    // Fallback: just lowercase + hyphenate original
    return raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  }

  // Deduplicate + sort alphabetically for canonical form
  return [...new Set(words)].sort().join('-');
}

// Parse "2019 Honda Civic SE" → { year: 2019, make: "Honda", model: "Civic SE" }
export function parseVehicle(v: string): { year: number | null; make: string; model: string } {
  const parts = (v ?? '').trim().split(/\s+/);
  const yearMatch = parts[0]?.match(/^\d{4}$/);
  const year = yearMatch ? parseInt(parts[0]) : null;
  const rest = year ? parts.slice(1) : parts;
  const make = rest[0] ?? '*';
  const model = rest.slice(1).join(' ') || '*';
  return { year, make, model };
}
