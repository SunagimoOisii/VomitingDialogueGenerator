export async function loadLexicon() {
  try {
    const res = await fetch('data/lexicon.json', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
