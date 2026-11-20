/** Short connecting words that ride along with their neighbours instead of counting toward a line. */
const MINOR_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with', '&', '-', '/']);

/**
 * Splits a course name into lines of two main words each; minor words do not count.
 * "Readings in Philippine History" -> ["Readings in Philippine", "History"].
 */
export const courseNameLines = (name: string) => {
  const lines: string[] = [];
  let current: string[] = [];
  let count = 0;
  name.trim().split(/\s+/).filter(Boolean).forEach((word) => {
    current.push(word);
    if (MINOR_WORDS.has(word.toLowerCase())) return;
    count += 1;
    if (count === 2) {
      lines.push(current.join(' '));
      current = [];
      count = 0;
    }
  });
  if (current.length) lines.push(current.join(' '));
  return lines;
};
