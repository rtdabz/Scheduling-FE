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

const CARD_CLASSES = 'mb-4 flex flex-wrap gap-1.5';

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
            aria-pressed={active}
            className={`selection-indicator inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${active ? '' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-[#5A1220]'}`}
          >
            {tab.label}
            <span className="selection-indicator-count rounded-full px-1.5 text-[10px]">{counts[tab.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
