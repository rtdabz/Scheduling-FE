const MINOR_WORDS = new Set(['to', 'and', 'of', 'in', 'the', 'a', 'for', 'with', 'on', 'at', 'by', 'an', 'or', 'as', 'but']);
const ACRONYMS = new Set(['NSTP', 'GEC', 'GEE', 'OJT', 'IT', 'PE', 'ROTC', 'CWTS', 'LTS', 'SIA', 'HCI', 'OOP', 'CMO']);

export const formatCourseName = (name: string): string => {
  if (!name) return '';
  
  const clean = name.replace(/\s+/g, ' ').trim();
  
  const words = clean.split(/(\s+|[-/()])/);
  
  let isFirstWord = true;
  
  const formattedWords = words.map((part) => {
    if (/^(\s+|[-/()])$/.test(part)) {
      return part;
    }
    
    const upperPart = part.toUpperCase();
    if (ACRONYMS.has(upperPart)) {
      isFirstWord = false;
      return upperPart;
    }
    
    const lowerPart = part.toLowerCase();
    if (MINOR_WORDS.has(lowerPart)) {
      if (isFirstWord) {
        isFirstWord = false;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      return lowerPart;
    }
    
    if (part.length === 0) return part;
    
    const formatted = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    isFirstWord = false;
    return formatted;
  });
  
  return formattedWords.join('');
};

export const capitalizeNameInput = (value: string): string =>
  value.replace(/(^|[\s-])(\p{Ll})/gu, (_match, boundary: string, letter: string) => boundary + letter.toUpperCase());

export const NAME_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const;

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
