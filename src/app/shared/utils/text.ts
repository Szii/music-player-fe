/** Shortens `text` to at most `max` characters, cutting at the last whole word. */
export function truncateAtWord(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const slice = trimmed.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : trimmed.slice(0, max);

  return cut.replace(/[\s\-|,:;&·–—]+$/, '');
}
