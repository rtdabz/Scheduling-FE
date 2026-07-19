import SectionHeader from './SectionHeader';
import type { LucideIcon } from 'lucide-react';

interface RadialProgressCardProps {
  title: string;
  icon: LucideIcon;
  value: number;
  label: string;
  footer: string;
}

export default function RadialProgressCard({
  title,
  icon,
  value,
  label,
  footer,
}: RadialProgressCardProps) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="bg-white p-4 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between flex-1">
      <div>
        <SectionHeader title={title} icon={icon} className="mb-4" />

        <div className="flex flex-col items-center justify-center py-2 relative">
          <div className="relative flex items-center justify-center">
            <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 192 192">
              <circle
                cx="96"
                cy="96"
                r={radius}
                className="stroke-gray-100 fill-transparent"
                strokeWidth="12"
              />
              <circle
                cx="96"
                cy="96"
                r={radius}
                className="stroke-[#5A1220] fill-transparent transition-all duration-500"
                strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-gray-800">{value}%</span>
              <span className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">{label}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3 text-center mt-3">
        <p className="text-sm text-gray-600">{footer}</p>
      </div>
    </div>
  );
}
