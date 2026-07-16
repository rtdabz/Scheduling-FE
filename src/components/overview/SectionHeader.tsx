import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  icon?: LucideIcon;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export default function SectionHeader({
  title,
  icon: Icon,
  subtitle,
  action,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${className}`}>
      <div className="flex items-center gap-2.5">
        {Icon && <Icon className="w-5 h-5 text-[#5A1220]" />}
        <h2 className="text-gray-800 font-bold text-lg">{title}</h2>
      </div>
      {action ?? (subtitle && <span className="text-xs text-gray-400 font-medium">{subtitle}</span>)}
    </div>
  );
}
