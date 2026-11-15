import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles';
import LoadingSpinner from './LoadingSpinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon; replaced by a spinner while `loading`. */
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, trailingIcon, loading = false, fullWidth = false, className = '', type = 'button', disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? <LoadingSpinner size={size === 'sm' ? 14 : 16} className="animate-spin" /> : icon}
      {children}
      {trailingIcon}
    </button>
  );
});

export default Button;
