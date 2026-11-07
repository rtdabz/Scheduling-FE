import type { CurriculumStatus } from '../../types/curriculum';

export interface CurriculumStatusTab {
  id: CurriculumStatus;
  label: string;
}

interface CurriculumStatusTabsProps {
  id?: string;
  tabs: CurriculumStatusTab[];
  selected: CurriculumStatus;
  counts: Partial<Record<CurriculumStatus, number>>;
  onSelect: (status: CurriculumStatus) => void;
  /** Replaces the default standalone card wrapper, e.g. when the buttons sit inside another toolbar. */
  className?: string;
}

const CARD_CLASSES = 'mb-4 flex flex-wrap gap-2 rounded-2xl border border-gray-150/70 bg-white p-2 shadow-sm';

/** Status buttons with a record count beside each label, shared by the curriculum list pages. */
export default function CurriculumStatusTabs({ id, tabs, selected, counts, onSelect, className = CARD_CLASSES }: CurriculumStatusTabsProps) {
  return (
    <div id={id} className={className}>
      {tabs.map((tab) => {
        const active = selected === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors ${active ? 'bg-[#4e0a10] text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-[#4e0a10]/5 hover:text-[#4e0a10]'}`}
          >
            {tab.label}
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>{counts[tab.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
