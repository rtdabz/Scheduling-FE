import { useState, type FormEvent } from 'react';
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, MonitorSmartphone } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { useToast } from '../../context/ToastContext';
import { ModalButton } from '../ui/ModalForm';

/**
 * Self-service security for the seeded VPAA account: link + verify a recovery Gmail (used by
 * Forgot Password on the login page) and change the password. Rendered only for the VPAA.
 */

const inputClass = 'h-9 w-full rounded-lg border border-[#E2D9D0] bg-white px-3 text-sm text-[#1A1410] outline-none transition focus:border-[#4e0a10]/40 focus:ring-2 focus:ring-[#C9952A]/40 disabled:bg-[#F7F4F0]';
const cardClass = 'rounded-xl border border-[#E2D9D0] bg-white';

type FieldErrors = Record<string, string>;

const RECOVERY_EMAIL_INPUT_ID = 'vpaa-recovery-email';

const fieldErrorsOf = (err: unknown): FieldErrors => {
  const errors = (err as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors;
  return errors ? Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages[0]])) : {};
};

function ErrorText({ id, message }: { id: string; message?: string }) {
  return message ? <span id={id} className="mt-1 block text-xs text-red-600">{message}</span> : null;
}

function CardHeader({ icon: Icon, title, description }: { icon: typeof Mail; title: string; description: string }) {
  return <div className="flex items-start gap-3 border-b border-[#E2D9D0]/70 px-4 py-3">
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F7F4F0] text-[#4e0a10]"><Icon size={15} /></span>
    <div>
      <h3 className="text-sm font-bold text-[#1A1410]">{title}</h3>
      <p className="text-xs text-[#7A6E67]">{description}</p>
    </div>
  </div>;
}

function RecoveryEmailCard({ email, onVerified }: { email?: string | null; onVerified: (email: string) => void }) {
  const { toast } = useToast();
  const [address, setAddress] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    const target = (pendingEmail ?? address).trim();
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.post<{ message: string; pending_email: string }>('/account/recovery-email', { email: target });
      setPendingEmail(data.pending_email);
      setCode('');
      toast.success('Verification Code Sent', data.message);
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      toast.error('Could Not Send Code', apiErrorMessage(err, 'The verification email could not be sent.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.post<{ message: string; email: string }>('/account/recovery-email/verify', { code: code.trim() });
      onVerified(data.email);
      setPendingEmail(null);
      setAddress('');
      setCode('');
      toast.success('Gmail Verified', data.message);
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      toast.error('Verification Failed', apiErrorMessage(err, 'The code could not be verified.'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => { setPendingEmail(null); setCode(''); setErrors({}); };

  return <section className={cardClass}>
    <CardHeader icon={Mail} title="Recovery Gmail" description="Password reset links for the VPAA account are sent to this verified address." />
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[#7A6E67]">Current:</span>
        {email
          ? <span className="inline-flex items-center gap-1.5 font-medium text-[#1A1410]"><CheckCircle2 size={14} className="text-emerald-600" /> {email} <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Verified</span></span>
          : <span className="font-medium text-amber-700">None linked. Forgot Password will not work until one is verified.</span>}
      </div>

      {pendingEmail === null
        ? <form onSubmit={sendCode} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <label className="block flex-1">
            <span className="sr-only">{email ? 'New Gmail address' : 'Gmail address'}</span>
            <input id={RECOVERY_EMAIL_INPUT_ID} type="email" autoComplete="email" required maxLength={255} value={address} onChange={(e) => { setAddress(e.target.value); setErrors({}); }} placeholder={email ? 'Change to another Gmail address' : 'name@gmail.com'} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'recovery-email-error' : undefined} className={inputClass} disabled={busy} />
            <ErrorText id="recovery-email-error" message={errors.email} />
          </label>
          <ModalButton type="submit" variant="primary" disabled={busy || !address.trim()}>
            {busy && <Loader2 size={14} className="animate-spin" />} Send Code
          </ModalButton>
        </form>
        : <form onSubmit={verify} className="space-y-2">
          <p className="text-xs text-[#7A6E67]">Enter the 6-digit code sent to <strong className="text-[#1A1410]">{pendingEmail}</strong>. It expires in 15 minutes.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <label className="block sm:w-44">
              <span className="sr-only">Verification code</span>
              <input inputMode="numeric" autoComplete="one-time-code" required pattern="\d{6}" maxLength={6} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrors({}); }} placeholder="000000" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? 'recovery-code-error' : undefined} className={`${inputClass} text-center font-mono tracking-[0.4em]`} disabled={busy} autoFocus />
              <ErrorText id="recovery-code-error" message={errors.code} />
            </label>
            <ModalButton type="submit" variant="primary" disabled={busy || code.length !== 6}>
              {busy && <Loader2 size={14} className="animate-spin" />} Verify
            </ModalButton>
            <ModalButton onClick={() => void sendCode()} disabled={busy}>Resend</ModalButton>
            <ModalButton onClick={cancel} disabled={busy}>Cancel</ModalButton>
          </div>
        </form>}
    </div>
  </section>;
}

interface PasswordForm { current_password: string; password: string; password_confirmation: string }
const EMPTY_PASSWORD_FORM: PasswordForm = { current_password: '', password: '', password_confirmation: '' };

/** Mirrors the server rule: Password::min(10)->letters()->mixedCase()->numbers(). */
const PASSWORD_REQUIREMENTS: Array<{ label: string; test: (value: string) => boolean }> = [
  { label: 'At least 10 characters', test: (v) => v.length >= 10 },
  { label: 'One uppercase letter', test: (v) => /\p{Lu}/u.test(v) },
  { label: 'One lowercase letter', test: (v) => /\p{Ll}/u.test(v) },
  { label: 'One number', test: (v) => /\d/.test(v) },
];

const passwordInputClass = (invalid: boolean) => `h-10 w-full rounded-lg border bg-white pl-3 pr-11 text-sm text-[#1A1410] shadow-sm shadow-black/[0.02] outline-none transition placeholder:text-[#B5ABA4] focus:ring-4 disabled:cursor-not-allowed disabled:bg-[#F7F4F0] disabled:text-[#7A6E67] ${invalid
  ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15'
  : 'border-[#E2D9D0] hover:border-[#D3C6BA] focus:border-[#4e0a10]/50 focus:ring-[#C9952A]/20'}`;

interface PasswordFieldProps {
  id: keyof PasswordForm;
  label: string;
  value: string;
  autoComplete: string;
  disabled: boolean;
  error?: string;
  describedBy?: string;
  onChange: (value: string) => void;
  children?: React.ReactNode;
}

function PasswordField({ id, label, value, autoComplete, disabled, error, describedBy, onChange, children }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = `vpaa-${id}`;
  const errorId = `${inputId}-error`;
  const described = [error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined;

  return <div className="min-w-0">
    <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-semibold text-[#1A1410]">{label}</label>
    <div className="relative">
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        spellCheck={false}
        required
        maxLength={255}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={described}
        className={passwordInputClass(Boolean(error))}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        aria-controls={inputId}
        aria-pressed={visible}
        title={visible ? 'Hide' : 'Show'}
        className="absolute inset-y-0 right-1 my-auto flex h-8 w-8 items-center justify-center rounded-md text-[#7A6E67] transition hover:bg-[#F7F4F0] hover:text-[#4e0a10] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] disabled:pointer-events-none disabled:opacity-40"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
    {error && <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600"><AlertCircle size={13} className="mt-px shrink-0" /> {error}</p>}
    {children}
  </div>;
}

function RequirementList({ id, password }: { id: string; password: string }) {
  return <ul id={id} aria-label="Password requirements" className="mt-2.5 grid grid-cols-1 gap-x-3 gap-y-1.5 rounded-lg bg-[#FBF9F7] px-3 py-2.5 ring-1 ring-inset ring-[#E2D9D0]/70 min-[420px]:grid-cols-2">
    {PASSWORD_REQUIREMENTS.map(({ label, test }) => {
      const met = test(password);
      return <li key={label} className={`flex items-center gap-1.5 text-xs transition-colors ${met ? 'font-medium text-emerald-700' : 'text-[#7A6E67]'}`}>
        <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${met ? 'bg-emerald-600 text-white' : 'bg-white text-transparent ring-1 ring-inset ring-[#D3C6BA]'}`}>
          <Check size={10} strokeWidth={3} />
        </span>
        {label}
        <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
      </li>;
    })}
  </ul>;
}

/** Locked until a recovery Gmail is verified: with no one above the VPAA, a forgotten password
 * would otherwise be unrecoverable. The server enforces the same rule. */
function ChangePasswordCard({ locked }: { locked: boolean }) {
  const { toast } = useToast();
  const [form, setForm] = useState<PasswordForm>(EMPTY_PASSWORD_FORM);
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const requirementsMet = PASSWORD_REQUIREMENTS.every(({ test }) => test(form.password));
  const confirmationStarted = form.password_confirmation.length > 0;
  const matches = confirmationStarted && form.password === form.password_confirmation;
  const reusesCurrent = form.password.length > 0 && form.password === form.current_password;
  const disabled = busy || locked;
  const canSubmit = !disabled && form.current_password.length > 0 && requirementsMet && matches && !reusesCurrent;
  const isEmpty = !form.current_password && !form.password && !form.password_confirmation;

  const set = (key: keyof PasswordForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
    setSucceeded(false);
  };

  const reset = () => { setForm(EMPTY_PASSWORD_FORM); setErrors({}); };

  const goToRecoveryEmail = () => {
    const input = document.getElementById(RECOVERY_EMAIL_INPUT_ID);
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.put<{ message: string }>('/account/password', form);
      setForm(EMPTY_PASSWORD_FORM);
      setSucceeded(true);
      toast.success('Password Changed', data.message);
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      toast.error('Password Not Changed', apiErrorMessage(err, 'Could not change your password.'));
    } finally {
      setBusy(false);
    }
  };

  const newPasswordError = errors.password || (reusesCurrent ? 'Choose a password different from your current one.' : undefined);
  const confirmationError = errors.password_confirmation
    || (confirmationStarted && form.password.length > 0 && !matches ? 'Passwords do not match.' : undefined);

  return <section aria-labelledby="change-password-title" className="overflow-hidden rounded-xl border border-[#E2D9D0] bg-white shadow-sm shadow-black/[0.03]">
    <header className="flex items-start gap-3.5 px-5 pb-4 pt-5">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4e0a10]/[0.06] text-[#4e0a10] ring-1 ring-inset ring-[#4e0a10]/10"><KeyRound size={18} /></span>
      <div className="min-w-0">
        <h3 id="change-password-title" className="text-[15px] font-bold leading-6 text-[#1A1410]">Change password</h3>
        <p className="mt-0.5 text-[13px] leading-5 text-[#7A6E67]">Confirm your current password, then choose a new one.</p>
      </div>
    </header>

    <form onSubmit={submit} noValidate aria-busy={busy} aria-disabled={locked || undefined}>
      <div className="space-y-5 border-t border-[#E2D9D0]/70 px-5 py-5">
        {locked && <div role="note" className="flex flex-col gap-3 rounded-lg bg-amber-50 px-3.5 py-3 ring-1 ring-inset ring-amber-600/25 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Lock size={16} className="mt-0.5 shrink-0 text-amber-700" />
            <p className="text-[13px] leading-5 text-amber-900">
              <span className="font-semibold">Link a recovery Gmail first.</span> The VPAA password can only be recovered through a verified Gmail, so changing it is locked until one is linked.
            </p>
          </div>
          <ModalButton onClick={goToRecoveryEmail} className="w-full shrink-0 sm:w-auto"><Mail size={14} /> Link Gmail</ModalButton>
        </div>}

        {succeeded && <div role="status" className="flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
          <span><span className="font-semibold">Password updated.</span> Other devices have been signed out; you are still signed in here.</span>
        </div>}

        <div className="sm:max-w-[calc(50%-0.625rem)]">
          <PasswordField id="current_password" label="Current password" autoComplete="current-password" value={form.current_password} onChange={set('current_password')} disabled={disabled} error={errors.current_password} />
        </div>

        <div className="grid grid-cols-1 gap-5 border-t border-dashed border-[#E2D9D0] pt-5 sm:grid-cols-2">
          <PasswordField id="password" label="New password" autoComplete="new-password" value={form.password} onChange={set('password')} disabled={disabled} error={newPasswordError} describedBy={locked ? undefined : 'vpaa-password-requirements'}>
            {!locked && <RequirementList id="vpaa-password-requirements" password={form.password} />}
          </PasswordField>
          <PasswordField id="password_confirmation" label="Confirm new password" autoComplete="new-password" value={form.password_confirmation} onChange={set('password_confirmation')} disabled={disabled} error={confirmationError}>
            {matches && <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} /> Passwords match</p>}
          </PasswordField>
        </div>
      </div>

      <footer className="flex flex-col-reverse gap-3 border-t border-[#E2D9D0]/70 bg-[#FBF9F7] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-[#7A6E67]">{locked
          ? <><Lock size={14} className="shrink-0 text-[#C9952A]" /> Requires a verified recovery Gmail.</>
          : <><MonitorSmartphone size={14} className="shrink-0 text-[#C9952A]" /> Other devices will be signed out.</>}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <ModalButton onClick={reset} disabled={disabled || isEmpty} className="w-full sm:w-auto">Clear</ModalButton>
          <ModalButton type="submit" variant="primary" loading={busy} disabled={!canSubmit} className="w-full sm:w-auto sm:min-w-[10.5rem]">
            {busy ? 'Updating…' : 'Update password'}
          </ModalButton>
        </div>
      </footer>
    </form>
  </section>;
}

export default function VpaaAccountSecurity({ email, onEmailVerified }: { email?: string | null; onEmailVerified: (email: string) => void }) {
  return <div className="space-y-4 p-4 sm:p-5">
    <RecoveryEmailCard email={email} onVerified={onEmailVerified} />
    <ChangePasswordCard locked={!email} />
  </div>;
}
