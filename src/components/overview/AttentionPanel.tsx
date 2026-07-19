import { ArrowRight } from 'lucide-react';
import SectionHeader from './SectionHeader';
import type { LucideIcon } from 'lucide-react';

export type AttentionTone = 'warning' | 'danger' | 'info' | 'success';

export interface AttentionItem {
  id: string;
  title: string;
  description: string;
  count: number;
  actionLabel: string;
  path: string;
  tone: AttentionTone;
  showPercent?: boolean;
}

interface AttentionPanelProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  items: AttentionItem[];
  onAction: (path: string) => void;
}

const attentionToneClasses: Record<AttentionTone, string> = {
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  danger: 'bg-red-50 border-red-200 text-red-700',
  info: 'bg-[#5A1220]/5 border-[#5A1220]/15 text-[#5A1220]',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
};

export default function AttentionPanel({
  title,
  subtitle,
  icon,
  items,
  onAction,
}: AttentionPanelProps) {
  return (
    <div className="bg-white p-4 rounded-xl border-[0.5px] border-gray-200">
      <SectionHeader title={title} icon={icon} subtitle={subtitle} className="mb-3" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${attentionToneClasses[item.tone]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold">{item.title}</p>
                <p className="text-xs opacity-80 mt-1 leading-relaxed">{item.description}</p>
              </div>
              <span className="text-xl font-extrabold leading-none">
                {item.showPercent ? `${item.count}%` : item.count}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onAction(item.path)}
              className="w-fit text-xs font-bold hover:underline flex items-center gap-1"
            >
              {item.actionLabel}
              <ArrowRight size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
