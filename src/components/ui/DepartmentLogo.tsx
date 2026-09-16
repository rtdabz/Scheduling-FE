import { useState } from 'react';
import { Building2 } from 'lucide-react';

interface DepartmentLogoProps {
  name: string;
  logo?: string | null;
  className: string;
  iconSize: number;
  fallbackClassName?: string;
}

/** Existing department uploads, with a placeholder for missing or broken images. */
export default function DepartmentLogo({ name, logo, className, iconSize, fallbackClassName = 'border-slate-200 bg-slate-100 text-slate-500' }: DepartmentLogoProps) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  if (logo && logo !== failedLogo) {
    return <img src={logo} alt={`${name} logo`} onError={() => setFailedLogo(logo)}
      className={`${className} shrink-0 rounded-full border border-gray-200 bg-white object-contain shadow-2xs`} />;
  }
  const label = `${name} — ${logo ? 'logo unavailable' : 'no logo uploaded'}`;
  return <span role="img" aria-label={label} title={label} className={`${className} flex shrink-0 items-center justify-center rounded-full border shadow-2xs ${fallbackClassName}`}>
    <Building2 size={iconSize} aria-hidden="true" />
  </span>;
}
