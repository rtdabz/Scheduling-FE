import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClass, type ButtonVariant } from './buttonStyles';

export type TableActionVariant = 'view' | 'print' | 'edit' | 'copy' | 'success' | 'danger' | 'delete' | 'archive' | 'remove' | 'neutral';

interface TableActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: TableActionVariant;
  children: ReactNode;
}

/**
 * Row actions always have a solid colored fill so they read as buttons inside a table row.
 * Colors follow meaning: view is blue, edit maroon, approve green, archive amber, destructive red.
 */
const tint = (variant: ButtonVariant) =>
  buttonClass({ variant, size: 'sm', iconOnly: true });
const variants: Record<TableActionVariant, string> = {
  view: tint('infoTint'),
  print: tint('neutralTint'),
  copy: tint('neutralTint'),
  neutral: tint('neutralTint'),
  archive: tint('warningTint'),
  edit: tint('accentTint'),
  success: tint('successTint'),
  danger: tint('dangerTint'),
  remove: tint('dangerTint'),
  delete: tint('danger'),
};

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
      className={`${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
