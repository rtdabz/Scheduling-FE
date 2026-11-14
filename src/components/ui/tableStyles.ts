/**
 * Typography and separators shared by every table. DataTable applies them itself; the few tables that keep
 * their own markup (grouped terms, editable rows, rows that stack into cards on phones) import these so
 * their headers and rows match.
 */
export const TABLE_HEAD = 'bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500';
export const TABLE_HEAD_ROW = 'border-b border-gray-200';
export const TABLE_ROW = 'border-t border-gray-100 transition-colors hover:bg-gray-50';
export const TABLE_GROUP_ROW = 'bg-gray-50/70 text-xs font-semibold text-gray-700';
export const TABLE_FOOT = 'border-t border-gray-200 bg-gray-50 font-semibold text-gray-800';
