import { ArrowRight } from 'lucide-react';
import SectionHeader from './SectionHeader';
import type { LucideIcon } from 'lucide-react';

export interface ProgressStage {
  id: string;
  label: string;
  count: number;
  percent?: number;
  dotClassName: string;
  cardClassName: string;
}

interface ScheduleProgressCardProps {
  title: string;
  icon: LucideIcon;
  progress: number;
  emptyMessage: string;
  stages: ProgressStage[];
  footerNote: string;
  footerMeta: string;
  actionLabel: string;
  onAction: () => void;
  showBadge?: boolean;
  badgeLabel?: string;
}

export default function ScheduleProgressCard({
  title,
  icon,
  progress,
  emptyMessage,
  stages,
  footerNote,
  footerMeta,
  actionLabel,
  onAction,
  showBadge = false,
  badgeLabel,
}: ScheduleProgressCardProps) {
  const hasStages = stages.some((stage) => stage.count > 0);

  return (
    <div className="lg:col-span-1 bg-white p-4 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between">
      <div>
        <SectionHeader
          title={title}
          icon={icon}
          className="mb-4"
          action={showBadge && badgeLabel ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#5A1220]/10 text-[#5A1220] text-xs font-bold border border-[#5A1220]/15">
              {badgeLabel}
            </span>
          ) : undefined}
        />

        {!hasStages ? (
          <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-xl text-center">
            <p className="text-gray-400 text-sm">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-3 w-full bg-gray-100 rounded-full flex overflow-hidden">
              <div
                style={{ width: `${progress}%` }}
                className="bg-[#5A1220] h-full transition-all duration-500"
                title={`Progress: ${progress}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              {stages.map((stage) => (
                <div key={stage.id} className={`p-3 rounded-xl border ${stage.cardClassName}`}>
                  <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                    <span className={`w-2.5 h-2.5 rounded-full block ${stage.dotClassName}`} />
                    {stage.label}
                  </div>
                  <p className="text-lg font-extrabold text-gray-800 mt-1">
                    {stage.count}{' '}
                    {stage.percent !== undefined && (
                      <span className="text-xs text-gray-400 font-medium">({stage.percent}%)</span>
                    )}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-3">
              <div className="text-xs text-gray-500 flex items-center justify-between gap-3">
                <span>{footerNote}</span>
                <span className="font-medium text-gray-400 whitespace-nowrap">{footerMeta}</span>
              </div>

              <button
                type="button"
                onClick={onAction}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#5A1220]/5 hover:bg-[#5A1220]/10 text-[#5A1220] text-sm font-bold border border-[#5A1220]/10 transition-colors"
              >
                {actionLabel}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
