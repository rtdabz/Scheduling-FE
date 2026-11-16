import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, Check, Eye, EyeOff, KeyRound, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { ModalButton, ModalNotice } from '../../components/ui/ModalForm';
import { modalControl } from '../../components/ui/modalStyles';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface Props {
  user: { id: number; name: string; username: string; email?: string | null };
  onClose: () => void;
}

/** Mirrors the server rule (min 10, upper + lower case letters, a number); each one is shown as a live checklist. */
const REQUIREMENTS: { label: string; met: (password: string) => boolean }[] = [
  { label: 'At least 10 characters', met: (p) => p.length >= 10 },
  { label: 'One uppercase letter', met: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', met: (p) => /[a-z]/.test(p) },
  { label: 'One number', met: (p) => /\d/.test(p) },
];

/** Same checks as the checklist, phrased as the message shown when the form is submitted too early. */
function passwordProblem(password: string): string {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Include both uppercase and lowercase letters.';
  if (!/\d/.test(password)) return 'Include at least one number.';
  return '';
}

const labelClass = 'mb-1.5 block text-[13px] font-medium text-slate-700';
const errorClass = 'mt-1.5 text-xs font-medium text-red-600';

function Field({ id, label, error, children }: { id: string; label: string; error: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        <span className="text-red-500" aria-hidden="true"> *</span>
      </label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className={errorClass}>{error}</p>}
    </div>
  );
}

/**
 * VPAA sets a new password for another account. Separate from Forgot Password and setup links:
 * no email is sent, and the user's existing sessions are signed out by the server.
 */
export default function ChangeUserPasswordModal({ user, onClose }: Props) {
  const { toast } = useToast();
  const titleId = useId();
  const subtitleId = useId();
  const noticeId = useId();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    const problem = passwordProblem(password);
    const mismatch = password !== confirmation ? 'Passwords do not match.' : '';
    setPasswordError(problem);
    setConfirmationError(mismatch);
    setFormError('');
    if (problem || mismatch) return;

    setIsSubmitting(true);
    try {
      const response = await api.put<{ message: string }>(`/user/${user.id}/password`, {
        password,
        password_confirmation: confirmation,
      });
      toast.success('Password changed', response.data.message);
      onClose();
    } catch (error) {
      const err = error as { response?: { data?: { message?: string; errors?: { password?: string[] } } } };
      const fieldError = err.response?.data?.errors?.password?.[0];
      if (fieldError) setPasswordError(fieldError);
      else setFormError(err.response?.data?.message || 'Unable to change the password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputType = showPassword ? 'text' : 'password';
  const passwordsMatch = confirmation.length > 0 && password === confirmation;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      busy={isSubmitting}
      closeOnOverlayClick={false}
      showCloseButton={false}
      labelledBy={titleId}
      describedBy={`${subtitleId} ${noticeId}`}
      className="!bg-white ring-1 ring-black/5"
      bodyClassName="!bg-white"
    >
      <form onSubmit={submit} noValidate>
        <header className="relative flex items-start gap-3 border-b border-slate-200/80 px-5 pb-3.5 pt-4">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-[#5A1220]" aria-hidden="true" />
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5A1220]/[0.07] text-[#5A1220] ring-1 ring-inset ring-[#5A1220]/15"
            aria-hidden="true"
          >
            <KeyRound size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-semibold leading-5 text-slate-900">Change Password</h2>
            <p id={subtitleId} className="mt-0.5 text-[13px] leading-5 text-slate-500">
              <span className="sr-only">Set a new password for </span>
              <span className="block truncate font-medium text-slate-700" title={user.name}>{user.name}</span>
              <span className="block truncate" title={user.email || `@${user.username}`}>{user.email || `@${user.username}`}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="-mr-1.5 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]/40 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div
            id={noticeId}
            className="flex items-start gap-2.5 rounded-lg border border-[#F5A623]/40 bg-[#FFF8EB] px-3 py-2 text-xs leading-[1.125rem] text-[#6B4A12]"
          >
            <AlertTriangle size={15} className="mt-px shrink-0 text-[#D98A0B]" aria-hidden="true" />
            <p>
              <span className="font-semibold text-[#5C3D0A]">Signs the user out of all devices.</span>{' '}
              They’ll need this new password to sign in. Share it with them securely.
            </p>
          </div>

          {formError && <ModalNotice tone="error" role="alert">{formError}</ModalNotice>}

          <Field id="vpaa-new-password" label="New password" error={passwordError}>
            <div className="relative">
              <input
                id="vpaa-new-password"
                type={inputType}
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={`${passwordError ? 'vpaa-new-password-error ' : ''}vpaa-password-requirements`}
                className={`${modalControl(Boolean(passwordError))} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C9952A]/40"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <ul id="vpaa-password-requirements" aria-label="Password requirements" className="mt-2.5 grid grid-cols-1 gap-x-3 gap-y-1.5 min-[360px]:grid-cols-2">
              {REQUIREMENTS.map(({ label, met }) => {
                const ok = met(password);
                return (
                  <li key={label} className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-colors ${ok ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white'}`}
                      aria-hidden="true"
                    >
                      {ok && <Check size={9} strokeWidth={3.5} />}
                    </span>
                    {label}
                    <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
                  </li>
                );
              })}
            </ul>
          </Field>

          <Field id="vpaa-confirm-password" label="Confirm new password" error={confirmationError}>
            <input
              id="vpaa-confirm-password"
              type={inputType}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => { setConfirmation(e.target.value); setConfirmationError(''); }}
              aria-invalid={Boolean(confirmationError)}
              aria-describedby={confirmationError ? 'vpaa-confirm-password-error' : undefined}
              className={modalControl(Boolean(confirmationError))}
            />
            {!confirmationError && passwordsMatch && (
              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700">
                <Check size={13} strokeWidth={3} aria-hidden="true" /> Passwords match
              </p>
            )}
          </Field>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200/80 bg-slate-50/70 px-5 py-3 min-[360px]:flex-row min-[360px]:justify-end">
          <ModalButton onClick={onClose} disabled={isSubmitting}>Cancel</ModalButton>
          <ModalButton type="submit" variant="primary" loading={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Change Password'}
          </ModalButton>
        </footer>
      </form>
    </Modal>
  );
}
