import { useState, type FormEvent } from 'react';
import { ROLE_LABELS, roleLabel } from '../../../lib/roles';
import { EMPTY_LOGIN_FILTERS, LOGIN_STATUSES, type LoginFilters, type LoginUserFacet } from './loginActivityModel';
import { FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles';

type Props = {
  applied: LoginFilters;
  users: LoginUserFacet[];
  onApply: (filters: LoginFilters) => void;
};

/** Date range, user, role and status filters shared by Login Locations and Login History. */
export default function LoginFiltersForm({ applied, users, onApply }: Props) {
  const [filters, setFilters] = useState<LoginFilters>(applied);
  const set = (key: keyof LoginFilters) => (value: string) => setFilters(current => ({ ...current, [key]: value }));
  const dateError = filters.from && filters.to && filters.from > filters.to ? 'The start date must be on or before the end date.' : '';
  const dirty = JSON.stringify(filters) !== JSON.stringify(applied);
  const appliedCount = Object.values(applied).filter(Boolean).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dateError) onApply(filters);
  };
  const clear = () => {
    setFilters(EMPTY_LOGIN_FILTERS);
    onApply(EMPTY_LOGIN_FILTERS);
  };

  const select = (label: string, key: keyof LoginFilters, options: [string, string][], all: string) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      <select aria-label={label} value={filters[key]} onChange={event => set(key)(event.target.value)}
        className={`${FIELD} cursor-pointer ${filters[key] ? 'border-[#701522]/50 bg-[#F5E9EA]/40' : ''}`}>
        <option value="">{all}</option>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );

  return (
    <form onSubmit={submit} aria-label="Filter sign-ins" className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">From</span>
          <input type="date" aria-label="From date" value={filters.from} max={filters.to || undefined} onChange={event => set('from')(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-gray-500">To</span>
          <input type="date" aria-label="To date" value={filters.to} min={filters.from || undefined} onChange={event => set('to')(event.target.value)} className={FIELD} />
        </label>
        {select('User', 'user_id', users.map(user => [String(user.id), `${user.name}${user.role ? ` — ${roleLabel(user.role)}` : ''}`]), 'All users')}
        {select('Role', 'role', Object.entries(ROLE_LABELS), 'All roles')}
        {select('Status', 'status', Object.entries(LOGIN_STATUSES).map(([value, info]) => [value, info.label]), 'All attempts')}
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
          <button type="submit" disabled={Boolean(dateError)} className={PRIMARY_BUTTON}>
            Apply
            {dirty && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#F5A623] ring-2 ring-white" />}
          </button>
          <button type="button" onClick={clear} disabled={appliedCount === 0 && !dirty} className={SECONDARY_BUTTON}>Clear</button>
        </div>
      </div>
      {dateError && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{dateError}</p>}
    </form>
  );
}
