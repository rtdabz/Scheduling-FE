import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  detail?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  hasError?: boolean;
  'aria-label'?: string;
}

/**
 * A single-select dropdown with a filter box, for lists too long to scan in a
 * native select. Matches the form inputs' height, border and focus ring.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No matches',
  disabled = false,
  hasError = false,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    // Inside a scrolling dialog body the list can open below the fold.
    rootRef.current?.querySelector('[role="listbox"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  const choose = (option: SearchableSelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(filtered.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm outline-none transition-all focus:ring-2 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 cursor-pointer ${
          hasError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'
        }`}
      >
        <span className={`truncate ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="relative border-b border-gray-100">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-activedescendant={filtered[active] ? `${listboxId}-${filtered[active].value}` : undefined}
              className="w-full py-2 pl-8 pr-3 text-sm outline-none"
            />
          </div>
          <ul id={listboxId} role="listbox" className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">{emptyText}</li>}
            {filtered.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${listboxId}-${option.value}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${
                    index === active ? 'bg-[#5A1220]/5' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className={`block truncate ${isSelected ? 'font-semibold text-[#5A1220]' : 'text-gray-800'}`}>{option.label}</span>
                    {option.detail && <span className="block truncate text-[11px] text-gray-500">{option.detail}</span>}
                  </span>
                  {isSelected && <Check size={14} className="shrink-0 text-[#5A1220]" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
