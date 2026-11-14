import React from 'react';
import { Search } from 'lucide-react';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  /** Smaller field for searches that sit inside a table header, panel or modal. */
  compact?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  containerClassName = 'relative flex-1 max-w-sm',
  compact = false,
  ...props
}) => {
  return (
    <div className={containerClassName}>
      <Search
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400 ${compact ? 'left-3' : 'left-3.5'}`}
        size={compact ? 15 : 18}
      />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full border border-gray-300 outline-none transition-all font-sans font-semibold text-gray-800 placeholder:font-medium placeholder:text-gray-400 focus:border-[#5A1220] focus:bg-white focus:ring-1 focus:ring-[#5A1220] ${compact ? 'h-9 rounded-lg bg-white pl-9 pr-3 text-xs' : 'rounded-xl bg-gray-50/30 py-2.5 pl-11 pr-4 text-sm'} ${className}`}
        {...props}
      />
    </div>
  );
};

export default SearchInput;
