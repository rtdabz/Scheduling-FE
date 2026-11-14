import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AtSign, BookOpen, Building2, CalendarDays, Camera, Clock, GraduationCap, Link2, Loader2, Lock, LogIn, Mail, MapPin, Trash2, UserRound, type LucideIcon } from 'lucide-react';
import Modal from '../ui/Modal';
import ProfileAvatar from '../ui/ProfileAvatar';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { formatTime12h } from '../../lib/timeGrid';
import { CREDENTIALS_MAX_LENGTH, titleOptions } from '../../lib/personName';
import { useToast } from '../../context/ToastContext';
import { ModalButton } from '../ui/ModalForm';

interface Unit { name?: string | null; code?: string | null; department_name?: string | null; department_code?: string | null }

export interface ProfileUser {
  account_version?: string;
  id?: number;
  name?: string;
  first_name?: string | null;
  middle_initial?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  honorific_prefix?: string | null;
  credentials?: string | null;
  username?: string;
  email?: string | null;
  role?: string;
  profile_picture?: string | null;
  photo?: string | null;
  avatar?: string | null;
  department?: Unit | null;
  program?: Unit | null;
  google_email?: string | null;
  google_linked_at?: string | null;
  last_login_at?: string | null;
  created_at?: string | null;
}

interface Meeting { day: string; start_time: string; end_time: string; room: string | null; mode: string | null }
interface TeachingClass { section_id: number; course_id: number; course_code: string; course_name: string; units: number; section_name: string; meetings: Meeting[] }
interface Teaching {
  employment_type: string | null;
  semester: { academic_year: string; semester: string } | null;
  assigned_units: number;
  basic_load: number;
  max_units: number;
  deload_units: number;
  overload_units: number;
  tier: string;
  tier_label: string;
  classes: TeachingClass[];
}
interface ProfileResponse { user: ProfileUser; suffixes: string[]; honorific_prefixes?: string[]; teaching: Teaching | null }

interface UserProfileModalProps {
  onClose: () => void;
  user: ProfileUser | null;
  roleLabel: string;
  onSaved: (user: ProfileUser) => void;
}

interface NameForm { honorific_prefix: string; first_name: string; middle_initial: string; last_name: string; suffix: string; credentials: string }

const AVATAR_SIZE = 300;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const unitLabel = (unit?: Unit | null) => {
  const name = unit?.department_name ?? unit?.name;
  const code = unit?.department_code ?? unit?.code;
  return name ? (code ? `${name} (${code})` : name) : null;
};

const nameFormFrom = (user: ProfileUser | null): NameForm => ({
  honorific_prefix: user?.honorific_prefix ?? '',
  credentials: user?.credentials ?? '',
  first_name: user?.first_name ?? '',
  middle_initial: user?.middle_initial ?? '',
  last_name: user?.last_name ?? '',
  suffix: user?.suffix ?? '',
});

const toAvatarDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const side = Math.min(img.width, img.height);
    const size = Math.min(AVATAR_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    URL.revokeObjectURL(url);
    if (!ctx) return reject(new Error('Canvas unavailable'));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    resolve(canvas.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unreadable image')); };
  img.src = url;
});

const inputClass = 'h-9 w-full rounded-lg border border-[#E2D9D0] bg-white px-3 text-sm text-[#1A1410] outline-none transition focus:border-[#4e0a10]/40 focus:ring-2 focus:ring-[#C9952A]/40 disabled:bg-[#F7F4F0]';
const cardClass = 'rounded-xl border border-[#E2D9D0] bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[#7A6E67]">{label}</span>{children}</label>;
}

function InfoCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className={`${cardClass} flex flex-col`}>
    <div className="flex items-center justify-between gap-2 border-b border-[#E2D9D0]/70 px-4 py-2.5">
      <h3 className="text-sm font-bold text-[#1A1410]">{title}</h3>
      {note && <span className="inline-flex items-center gap-1 rounded-full bg-[#F7F4F0] px-2 py-0.5 text-[11px] font-semibold text-[#7A6E67]"><Lock size={11} /> Read-only</span>}
    </div>
    <dl className="divide-y divide-[#E2D9D0]/60">{children}</dl>
    {note && <p className="mt-auto border-t border-[#E2D9D0]/60 px-4 py-2 text-xs text-[#7A6E67]">{note}</p>}
  </section>;
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: string | null }) {
  return <div className="relative min-w-0 py-2 pl-[3.75rem] pr-4">
    <dt className="text-xs text-[#7A6E67]">
      <span aria-hidden="true" className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-[#F7F4F0] text-[#4e0a10]"><Icon size={15} /></span>
      {label}
    </dt>
    <dd className="break-words text-sm font-medium text-[#1A1410]">{value || '—'}</dd>
  </div>;
}

const tierStyles: Record<string, string> = {
  basic: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  overload: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  beyond_ceiling: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};

function TeachingLoad({ teaching }: { teaching: Teaching }) {
  const { assigned_units: assigned, basic_load: basic, overload_units: overload } = teaching;
  const scale = Math.max(assigned, basic + overload, 1);
  const pct = (units: number) => `${Math.min(100, (units / scale) * 100)}%`;
  const inBasic = Math.min(assigned, basic);
  const inOverload = Math.min(Math.max(assigned - basic, 0), overload);
  const beyond = Math.max(assigned - basic - overload, 0);

  return <div className="space-y-4 p-4 sm:p-5">
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {teaching.semester ? `${teaching.semester.semester} Semester · A.Y. ${teaching.semester.academic_year}` : 'No active semester'}
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{assigned}<span className="text-sm font-semibold text-slate-400"> / {basic + overload} units</span></p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${tierStyles[teaching.tier] ?? tierStyles.basic}`}>{teaching.tier_label}</span>
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${assigned} of ${basic + overload} units assigned`}>
        <span className="bg-emerald-500" style={{ width: pct(inBasic) }} />
        <span className="bg-amber-500" style={{ width: pct(inOverload) }} />
        <span className="bg-rose-500" style={{ width: pct(beyond) }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        {[
          ['Max units', teaching.max_units],
          ['Deload', teaching.deload_units],
          ['Basic load', basic],
          ['Overload', overload],
          ['Ceiling', basic + overload],
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
          <dt className="text-slate-500">{label}</dt><dd className="font-bold text-slate-800">{value}</dd>
        </div>)}
      </dl>
    </section>

    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800"><BookOpen size={15} className="text-[#4e0a10]" /> Assigned classes <span className="font-medium text-slate-400">({teaching.classes.length})</span></h3>
      {teaching.classes.length === 0
        ? <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">No classes assigned to you this semester yet.</p>
        : <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {teaching.classes.map((item) => <li key={`${item.section_id}:${item.course_id}`} className="rounded-xl border border-black/5 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">{item.course_code} <span className="font-medium text-slate-500">· {item.section_name}</span></p>
                <p className="truncate text-xs text-slate-500">{item.course_name}</p>
              </div>
              <span className="shrink-0 rounded-md bg-[#4e0a10]/5 px-2 py-0.5 text-xs font-bold text-[#4e0a10]">{item.units} {item.units === 1 ? 'unit' : 'units'}</span>
            </div>
            {item.meetings.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">
              {item.meetings.map((meeting) => <li key={`${meeting.day}-${meeting.start_time}`} className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
                <Clock size={11} /> {meeting.day.slice(0, 3)} {formatTime12h(meeting.start_time)}–{formatTime12h(meeting.end_time)}
                {(meeting.room || meeting.mode === 'online') && <><MapPin size={11} className="ml-0.5" /> {meeting.room ?? 'Online'}</>}
              </li>)}
            </ul>}
          </li>)}
        </ul>}
    </section>
  </div>;
}

export default function UserProfileModal({ onClose, user, roleLabel, onSaved }: UserProfileModalProps) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'profile' | 'teaching'>('profile');
  const [form, setForm] = useState<NameForm>(() => nameFormFrom(user));
  const [picture, setPicture] = useState<string | null>(() => user?.profile_picture || user?.photo || user?.avatar || null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const current = profile?.user ?? user;
  const savedPicture = current?.profile_picture || current?.photo || current?.avatar || null;
  const initialForm = nameFormFrom(current);
  const dirty = picture !== savedPicture || (Object.keys(form) as Array<keyof NameForm>).some((key) => form[key] !== initialForm[key]);

  useEffect(() => {
    let active = true;
    api.get<ProfileResponse>('/profile')
      .then(({ data }) => {
        if (!active) return;
        setProfile(data);
        setForm(nameFormFrom(data.user));
        setPicture(data.user.profile_picture ?? null);
      })
      .catch((err) => active && toast.error('Profile Unavailable', apiErrorMessage(err, 'Could not load your profile.')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [toast]);

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > MAX_UPLOAD_BYTES) {
      toast.error('Invalid Photo', 'Choose a PNG, JPG or WebP image under 5 MB.');
      return;
    }
    try { setPicture(await toAvatarDataUrl(file)); } catch { toast.error('Invalid Photo', 'That image could not be read.'); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { data } = await api.patch<{ message: string; data: ProfileResponse }>('/profile', {
        expected_version: profile?.user.account_version,
        first_name: form.first_name.trim(),
        middle_initial: form.middle_initial.trim() || null,
        last_name: form.last_name.trim(),
        suffix: form.suffix || null,
        honorific_prefix: form.honorific_prefix || null,
        credentials: form.credentials.trim() || null,
        profile_picture: picture,
      });
      setProfile(data.data);
      setForm(nameFormFrom(data.data.user));
      setPicture(data.data.user.profile_picture ?? null);
      onSaved(data.data.user);
      toast.success('Profile Updated', data.message);
    } catch (err) {
      const fieldErrors = (err as { response?: { data?: { errors?: Record<string, string[]> } } }).response?.data?.errors;
      if (fieldErrors) setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([key, messages]) => [key, messages[0]])));
      toast.error('Update Failed', apiErrorMessage(err, 'Could not save your profile.'));
    } finally {
      setSaving(false);
    }
  };

  const teaching = profile?.teaching ?? null;
  const setField = (key: keyof NameForm) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const tabs: Array<['profile' | 'teaching', string, LucideIcon]> = [['profile', 'Profile', UserRound], ...(teaching ? [['teaching', 'Teaching Load', BookOpen] as ['teaching', string, LucideIcon]] : [])];
  const department = unitLabel(current?.department);

  const footer = tab === 'profile' ? <>
    <ModalButton onClick={onClose}>Close</ModalButton>
    <ModalButton variant="primary" type="submit" form="profile-form" disabled={!dirty || saving || loading}>
      {saving && <Loader2 size={14} className="animate-spin" />} {saving ? 'Saving…' : 'Save Changes'}
    </ModalButton>
  </> : undefined;

  return <Modal isOpen onClose={onClose} title="My Profile" description="Your account details and teaching load" size="lg" className="!max-w-[900px]" footer={footer}>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[#E2D9D0] bg-white px-4 py-3 sm:px-5">
      <div className="relative shrink-0">
        <ProfileAvatar src={picture} alt={current?.name || 'User'} className="h-16 w-16 rounded-full ring-2 ring-[#C9952A]/40" />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={loading} aria-label="Change photo" title="Change photo" className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#4e0a10] text-white ring-2 ring-white transition hover:bg-[#640d14] focus:outline-none focus-visible:ring-[#C9952A] disabled:opacity-50">
          <Camera size={12} />
        </button>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={choosePhoto} />
      </div>
      <div className="min-w-[11rem] flex-1">
        <p className="truncate text-lg font-bold leading-6 text-[#1A1410]">{current?.name || 'Administrator'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full bg-[#4e0a10] px-2.5 py-0.5 text-[11px] font-bold text-white">{roleLabel}</span>
          {teaching && <span className="rounded-full bg-[#C9952A]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#8a6419]">Instructor</span>}
          {department && <span className="inline-flex min-w-0 items-center gap-1 text-xs text-[#7A6E67]"><Building2 size={12} className="shrink-0" /> {department}</span>}
        </div>
        {picture && <button type="button" onClick={() => setPicture(null)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"><Trash2 size={12} /> Remove photo</button>}
        {errors.profile_picture && <p className="mt-1 text-xs text-red-600">{errors.profile_picture}</p>}
      </div>
      {tabs.length > 1 && <div className="flex w-full rounded-lg bg-[#F7F4F0] p-1 ring-1 ring-inset ring-[#E2D9D0] sm:w-auto" role="tablist" aria-label="Profile sections">
        {tabs.map(([key, label, Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] ${tab === key ? 'bg-[#4e0a10] text-white shadow-sm' : 'text-[#7A6E67] hover:text-[#4e0a10]'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>}
    </div>

    {loading && !profile
      ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading profile…</div>
      : tab === 'teaching' && teaching
        ? <TeachingLoad teaching={teaching} />
        : <form id="profile-form" onSubmit={save} className="space-y-4 p-4 sm:p-5">
          <section className={cardClass}>
            <h3 className="border-b border-[#E2D9D0]/70 px-4 py-2.5 text-sm font-bold text-[#1A1410]">Profile information</h3>
            <div className="grid grid-cols-6 gap-3 p-4 sm:grid-cols-12">
              <div className="col-span-6 sm:col-span-4">
                <Field label="First name">
                  <input required maxLength={100} value={form.first_name} onChange={setField('first_name')} className={inputClass} />
                  {errors.first_name && <span className="mt-1 block text-xs text-red-600">{errors.first_name}</span>}
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="M.I.">
                  <input maxLength={1} value={form.middle_initial} onChange={(event) => setForm((prev) => ({ ...prev, middle_initial: event.target.value.replace(/[^a-z]/gi, '').toUpperCase() }))} className={inputClass} />
                </Field>
              </div>
              <div className="col-span-4">
                <Field label="Last name">
                  <input required maxLength={100} value={form.last_name} onChange={setField('last_name')} className={inputClass} />
                  {errors.last_name && <span className="mt-1 block text-xs text-red-600">{errors.last_name}</span>}
                </Field>
              </div>
              <div className="col-span-3 sm:col-span-2">
                <Field label="Suffix">
                  <select value={form.suffix} onChange={setField('suffix')} className={inputClass}>
                    <option value="">None</option>
                    {(profile?.suffixes ?? []).map((suffix) => <option key={suffix} value={suffix}>{suffix}</option>)}
                  </select>
                </Field>
              </div>
              <div className="col-span-3 sm:col-span-4">
                <Field label="Title">
                  <select value={form.honorific_prefix} onChange={setField('honorific_prefix')} className={inputClass}>
                    <option value="">None</option>
                    {titleOptions(profile?.honorific_prefixes ?? [], form.honorific_prefix).map((title) => <option key={title} value={title}>{title}</option>)}
                  </select>
                  {errors.honorific_prefix && <span className="mt-1 block text-xs text-red-600">{errors.honorific_prefix}</span>}
                </Field>
              </div>
              <div className="col-span-6 sm:col-span-8">
                <Field label="Credentials / Degrees">
                  <input maxLength={CREDENTIALS_MAX_LENGTH} value={form.credentials} onChange={setField('credentials')} placeholder="e.g. PhD, EdD" className={inputClass} />
                  {errors.credentials && <span className="mt-1 block text-xs text-red-600">{errors.credentials}</span>}
                </Field>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard title="Account details" note="Managed by the VPAA. Ask them to change your username, email, role or department.">
              <InfoRow icon={AtSign} label="Username" value={current?.username} />
              <InfoRow icon={Mail} label="Email" value={current?.email} />
              <InfoRow icon={Building2} label="Department" value={department} />
              <InfoRow icon={GraduationCap} label="Program" value={unitLabel(current?.program)} />
            </InfoCard>
            <InfoCard title="Account activity">
              <InfoRow icon={Link2} label="Google account" value={current?.google_linked_at ? current.google_email || 'Linked' : 'Not linked'} />
              <InfoRow icon={LogIn} label="Last login" value={formatDate(current?.last_login_at)} />
              <InfoRow icon={CalendarDays} label="Member since" value={formatDate(current?.created_at)} />
            </InfoCard>
          </div>
        </form>}
  </Modal>;
}
