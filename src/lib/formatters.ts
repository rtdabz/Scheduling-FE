const MINOR_WORDS = new Set(['to', 'and', 'of', 'in', 'the', 'a', 'for', 'with', 'on', 'at', 'by', 'an', 'or', 'as', 'but']);
const ACRONYMS = new Set(['NSTP', 'GEC', 'GEE', 'OJT', 'IT', 'PE', 'ROTC', 'CWTS', 'SIA', 'HCI', 'OOP', 'CMO']);

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
