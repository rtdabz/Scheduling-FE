import React from 'react';
import { Search } from 'lucide-react';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  containerClassName = 'relative flex-1 max-w-sm',
  ...props
}) => {
  return (
    <div className={containerClassName}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] bg-gray-50/30 focus:bg-white transition-all font-sans font-semibold text-gray-800 ${className}`}
        {...props}
      />
    </div>
  );
};

export default SearchInput;
