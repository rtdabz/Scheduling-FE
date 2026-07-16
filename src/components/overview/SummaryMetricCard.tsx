import type { LucideIcon } from 'lucide-react';

interface SummaryMetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconClassName?: string;
  iconWrapperClassName?: string;
  className?: string;
}

export default function SummaryMetricCard({
  label,
  value,
  icon: Icon,
  iconClassName = 'text-[#5A1220]',
  iconWrapperClassName = 'bg-[#5A1220]/5',
  className = '',
}: SummaryMetricCardProps) {
  return (
    <div className={`bg-white p-5 rounded-xl border-[0.5px] border-gray-200 relative group overflow-hidden ${className}`}>
      <div className="flex items-center justify-between text-gray-400 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider truncate">{label}</span>
        <div className={`p-1.5 rounded-lg ${iconWrapperClassName} ${iconClassName}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-extrabold text-gray-900">{value}</p>
    </div>
  );
}
