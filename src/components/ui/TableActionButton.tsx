import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type TableActionVariant = 'view' | 'print' | 'edit' | 'copy' | 'success' | 'danger' | 'archive' | 'neutral';

interface TableActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: TableActionVariant;
  children: ReactNode;
}

const variants: Record<TableActionVariant, string> = {
  view: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
  print: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
  edit: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  copy: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  success: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
  danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  archive: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  neutral: 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100',
};

/** Consistent color-coded icon action used by tables and compact record cards. */
export default function TableActionButton({
  label,
  variant = 'neutral',
  children,
  className = '',
  type = 'button',
  ...props
}: TableActionButtonProps) {
  return (
    <button
      type={type}
      title={label}
      aria-label={props['aria-label'] ?? label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
