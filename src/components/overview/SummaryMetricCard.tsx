import type { LucideIcon } from 'lucide-react';

interface SummaryMetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconClassName?: string;
  iconWrapperClassName?: string;
  className?: string;
  onClick?: () => void;
}

export default function SummaryMetricCard({
  label,
  value,
  icon: Icon,
  iconClassName = 'text-[#5A1220]',
  iconWrapperClassName = 'bg-[#5A1220]/5',
  className = '',
  onClick,
}: SummaryMetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white p-4 rounded-xl border-[0.5px] border-gray-200 relative group overflow-hidden ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}
    >
      <div className="flex items-center justify-between text-gray-400 mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate">{label}</span>
        <div className={`p-1.5 rounded-lg ${iconWrapperClassName} ${iconClassName}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <p className="text-2xl font-extrabold text-gray-900">{value}</p>
    </div>
  );
}
