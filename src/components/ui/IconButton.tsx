import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name and tooltip; icon-only buttons must say what they do. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'secondary', size = 'md', className = '', type = 'button', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={props.title ?? label}
      aria-label={props['aria-label'] ?? label}
      className={buttonClass({ variant, size, iconOnly: true, className })}
      {...props}
    >
      {children}
    </button>
  );
});

export default IconButton;
