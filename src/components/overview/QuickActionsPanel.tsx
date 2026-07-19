import SectionHeader from './SectionHeader';
import type { LucideIcon } from 'lucide-react';

export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  onClick: () => void;
}

interface QuickActionsPanelProps {
  title: string;
  actions: QuickAction[];
  layout?: 'list' | 'grid';
}

export default function QuickActionsPanel({
  title,
  actions,
  layout = 'list',
}: QuickActionsPanelProps) {
  const actionContainerClassName = layout === 'grid' ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5';
  const buttonClassName = layout === 'grid'
    ? 'p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center'
    : 'w-full min-h-12 px-3.5 py-2.5 flex items-center gap-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] group';

  return (
    <div className="bg-white p-4 rounded-xl border-[0.5px] border-gray-200 flex flex-col gap-3">
      <SectionHeader title={title} />
      <div className={actionContainerClassName}>
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={buttonClassName}
            >
              <Icon className="w-5 h-5 text-[#5A1220] group-hover:scale-105 transition-transform flex-shrink-0" />
              {layout === 'grid' ? (
                <span className="text-[10px] font-bold">{action.label}</span>
              ) : (
                <span className="flex flex-col text-left">
                  <span className="text-sm font-bold">{action.label}</span>
                  {action.description && (
                    <span className="text-xs text-gray-400 font-medium">{action.description}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
