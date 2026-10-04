export const normalizeDepartmentKey = (code: string, name = ''): string => {
  const normalizedCode = code.trim().toUpperCase();
  const value = name.toLowerCase();
  if (['IT', 'CIT'].includes(normalizedCode) || value.includes('information technology')) return 'IT';
  if (['AS', 'CAS'].includes(normalizedCode) || value.includes('arts and sciences')) return 'AS';
  if (['EDUC', 'CED'].includes(normalizedCode) || value.includes('education')) return 'EDUC';
  if (['BA', 'CBA'].includes(normalizedCode) || value.includes('business')) return 'BA';
  if (['HM', 'CHM'].includes(normalizedCode) || value.includes('hospitality')) return 'HM';
  if (['CM', 'MID'].includes(normalizedCode) || value.includes('midwifery')) return 'MID';
  if (['CRIM', 'CCJ', 'CCJPS'].includes(normalizedCode) || value.includes('criminal')) return 'CRIM';
  if (['LIS', 'CLIS'].includes(normalizedCode) || value.includes('library')) return 'LIS';
  return '';
};

export const getDeptStyles = (code: string, name = ''): string => {
  switch (normalizeDepartmentKey(code, name)) {
    case 'IT':
      return 'bg-blue-50 text-blue-800 border-blue-400 border-l-blue-700 hover:bg-blue-100/60';
    case 'AS':
      return 'bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]/40 border-l-[#7C3AED] hover:bg-[#7C3AED]/20';
    case 'EDUC':
      return 'bg-orange-50 text-orange-800 border-orange-400 border-l-orange-600 hover:bg-orange-100/60';
    case 'BA':
      return 'bg-yellow-50 text-yellow-800 border-yellow-400 border-l-yellow-600 hover:bg-yellow-100/60';
    case 'HM':
      return 'bg-lime-50 text-lime-800 border-lime-400 border-l-lime-600 hover:bg-lime-100/60';
    case 'MID':
      return 'bg-green-50 text-green-800 border-green-400 border-l-green-600 hover:bg-green-100/60';
    case 'CRIM':
      return 'bg-[#4e0a10]/10 text-[#4e0a10] border-[#6b0f1a] border-l-[#4e0a10] hover:bg-[#4e0a10]/15';
    case 'LIS':
      return 'bg-pink-50 text-pink-800 border-pink-400 border-l-pink-600 hover:bg-pink-100/60';
    default:
      return 'bg-purple-50 text-purple-800 border-purple-400 border-l-purple-600 hover:bg-purple-100/60';
  }
};

export const getDeptBadgeStyles = (code: string, name = ''): string => {
  switch (normalizeDepartmentKey(code, name)) {
    case 'IT': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'AS': return 'bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]/30';
    case 'EDUC': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'BA': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'HM': return 'bg-lime-100 text-lime-800 border-lime-200';
    case 'MID': return 'bg-green-100 text-green-800 border-green-200';
    case 'CRIM': return 'bg-[#4e0a10]/10 text-[#4e0a10] border-[#6b0f1a]/30';
    case 'LIS': return 'bg-pink-100 text-pink-800 border-pink-200';
    default: return 'bg-purple-100 text-purple-800 border-purple-200';
  }
};

export const getDeptAccentClass = (code: string, name = ''): string => {
  switch (normalizeDepartmentKey(code, name)) {
    case 'IT': return 'bg-blue-600';
    case 'AS': return 'bg-[#7C3AED]';
    case 'EDUC': return 'bg-orange-500';
    case 'BA': return 'bg-yellow-500';
    case 'HM': return 'bg-lime-500';
    case 'MID': return 'bg-green-600';
    case 'CRIM': return 'bg-[#4e0a10]';
    case 'LIS': return 'bg-pink-500';
    default: return 'bg-purple-500';
  }
};
