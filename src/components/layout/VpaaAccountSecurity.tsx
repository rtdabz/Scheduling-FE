import { useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
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
            <input type="email" autoComplete="email" required maxLength={255} value={address} onChange={(e) => { setAddress(e.target.value); setErrors({}); }} placeholder={email ? 'Change to another Gmail address' : 'name@gmail.com'} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'recovery-email-error' : undefined} className={inputClass} disabled={busy} />
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

function ChangePasswordCard() {
  const { toast } = useToast();
  const [form, setForm] = useState<PasswordForm>(EMPTY_PASSWORD_FORM);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = (key: keyof PasswordForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== form.password_confirmation) {
      setErrors({ password_confirmation: 'The two passwords do not match.' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.put<{ message: string }>('/account/password', form);
      setForm(EMPTY_PASSWORD_FORM);
      toast.success('Password Changed', data.message);
    } catch (err) {
      setErrors(fieldErrorsOf(err));
      toast.error('Password Not Changed', apiErrorMessage(err, 'Could not change your password.'));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof PasswordForm, label: string, autoComplete: string, hint?: string) => <label className="block">
    <span className="mb-1 block text-xs font-medium text-[#7A6E67]">{label}{hint && <span className="font-normal"> ({hint})</span>}</span>
    <input type={show ? 'text' : 'password'} autoComplete={autoComplete} required maxLength={255} minLength={key === 'current_password' ? undefined : 10} value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} className={inputClass} disabled={busy} />
    <ErrorText id={`${key}-error`} message={errors[key]} />
  </label>;

  return <section className={cardClass}>
    <CardHeader icon={KeyRound} title="Change password" description="Other devices are signed out after the change; this one stays signed in." />
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
      {field('current_password', 'Current password', 'current-password')}
      {field('password', 'New password', 'new-password', 'min. 10, upper & lower case, a number')}
      {field('password_confirmation', 'Confirm new password', 'new-password')}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
        <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4e0a10] hover:underline">
          {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? 'Hide passwords' : 'Show passwords'}
        </button>
        <ModalButton type="submit" variant="primary" disabled={busy || !form.current_password || !form.password || !form.password_confirmation}>
          {busy && <Loader2 size={14} className="animate-spin" />} Change Password
        </ModalButton>
      </div>
    </form>
  </section>;
}

export default function VpaaAccountSecurity({ email, onEmailVerified }: { email?: string | null; onEmailVerified: (email: string) => void }) {
  return <div className="space-y-4 p-4 sm:p-5">
    <p className="flex items-center gap-2 text-xs text-[#7A6E67]"><ShieldCheck size={14} className="text-[#4e0a10]" /> These settings apply only to the VPAA account.</p>
    <RecoveryEmailCard email={email} onVerified={onEmailVerified} />
    <ChangePasswordCard />
  </div>;
}
