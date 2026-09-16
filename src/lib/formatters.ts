const MINOR_WORDS = new Set(['to', 'and', 'of', 'in', 'the', 'a', 'for', 'with', 'on', 'at', 'by', 'an', 'or', 'as', 'but']);
const ACRONYMS = new Set(['NSTP', 'GEC', 'GEE', 'OJT', 'IT', 'PE', 'ROTC', 'CWTS', 'LTS', 'SIA', 'HCI', 'OOP', 'CMO']);

export const formatCourseName = (name: string): string => {
  if (!name) return '';
  
  // Normalize extra spaces
  const clean = name.replace(/\s+/g, ' ').trim();
  
  // Split the string into words, preserving spaces and punctuation/delimiters
  const words = clean.split(/(\s+|[-/()])/);
  
  let isFirstWord = true;
  
  const formattedWords = words.map((part) => {
    // If it's a delimiter/whitespace, return it unmodified
    if (/^(\s+|[-/()])$/.test(part)) {
      return part;
    }
    
    // Check if the part is a common acronym
    const upperPart = part.toUpperCase();
    if (ACRONYMS.has(upperPart)) {
      isFirstWord = false;
      return upperPart;
    }
    
    // Check if the part is a minor word
    const lowerPart = part.toLowerCase();
    if (MINOR_WORDS.has(lowerPart)) {
      if (isFirstWord) {
        isFirstWord = false;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      return lowerPart;
    }
    
    // Otherwise capitalize each word (Title Case)
    if (part.length === 0) return part;
    
    // Turn first letter into uppercase, rest lowercase
    const formatted = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    isFirstWord = false;
    return formatted;
  });
  
  return formattedWords.join('');
};

/**
 * Capitalizes the first letter of every word as a name is typed:
 * "del rosario" -> "Del Rosario", "mary-ann" -> "Mary-Ann".
 *
 * Only the first letter is touched and the rest is left as typed, so
 * "McDonald" or "DelaCruz" survive, and it is safe to run on every keystroke.
 */
export const capitalizeNameInput = (value: string): string =>
  value.replace(/(^|[\s-])(\p{Ll})/gu, (_match, boundary: string, letter: string) => boundary + letter.toUpperCase());

/** Name suffixes an instructor record accepts. Mirrors Faculty::NAME_SUFFIXES. */
export const NAME_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const;

/**
 * "Last, First M. Suffix" as the faculty roster lists an instructor, e.g.
 * "Del Rosario, Roberto A. Jr.". The suffix follows the given name and middle
 * initial so the list still reads, and sorts, by surname first.
 */
export const formatFacultyListName = (faculty: {
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  suffix?: string | null;
}): string =>
  [
    `${faculty.last_name},`,
    faculty.first_name,
    faculty.middle_name ? `${faculty.middle_name.charAt(0)}.` : '',
    faculty.suffix ?? '',
  ]
    .filter(Boolean)
    .join(' ');
