import type React from 'react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, Building2, CalendarDays, CheckCircle2, ChevronDown, FlaskConical, Gauge, Info, Loader2, SlidersHorizontal, TreePine, Wifi } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import ConfirmModal from '../../components/ui/ConfirmModal';

interface SchedulingSettings {
  department_id: number;
  scheduling_profile: 'standard' | 'laboratory_enabled';
  lecture_lab_schedule_override_enabled: boolean;
  custom_lab_duration_override_enabled: boolean;
  custom_lab_duration_minutes: number | null;
  custom_lab_duration_6_hours_enabled: boolean;
  custom_lab_duration_5_hours_enabled: boolean;
  custom_lab_duration_other_enabled: boolean;
  gec_split_schedule_override_enabled: boolean;
  field_evening_schedule_enabled: boolean;
  sunday_online_only_enabled: boolean;
  online_slot_limit: number;
  field_slot_limit: number;
  lecture_lab_available: boolean;
}

interface PendingConfirmation {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'info' | 'maroon';
  onConfirm: () => void;
}

interface SettingToggleCardProps {
  title: string;
  description: string;
  note: string;
  noteTone?: 'default' | 'danger';
  enabled: boolean;
  isLoading: boolean;
  isSaving: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  onToggle: () => void;
  children?: React.ReactNode;
  recommendation?: 'recommended' | 'optional' | 'not-applicable';
}

interface SettingsDropdownProps {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

function SettingsDropdown({
  id,
  title,
  description,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: SettingsDropdownProps) {
  return (
    <section className="overflow-hidden bg-white" style={{ borderRadius: 10 }}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
        aria-expanded={isOpen}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 8 }}>
            <Icon size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">{title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={`space-y-3 bg-[#faf9f7] transition-[opacity,padding] duration-200 ease-out ${
              isOpen ? 'border-t border-slate-100 p-3 opacity-100 sm:p-4' : 'p-0 opacity-0'
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingToggleCard({
  title,
  description,
  note,
  noteTone = 'default',
  enabled,
  isLoading,
  isSaving,
  disabled = false,
  icon: Icon,
  onToggle,
  children,
  recommendation = 'optional',
}: SettingToggleCardProps) {
  const recommendationStyles = {
    recommended: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    optional: 'border-slate-200 bg-slate-50 text-slate-600',
    'not-applicable': 'border-amber-200 bg-amber-50 text-amber-700',
  };
  const recommendationLabels = {
    recommended: 'Recommended',
    optional: 'Optional',
    'not-applicable': 'Not for this profile',
  };

  return (
    <section
      className={`border bg-white shadow-sm ${
        recommendation === 'recommended' ? 'border-l-4 border-l-emerald-500 border-y-slate-200 border-r-slate-200' : 'border-slate-200'
      }`}
      style={{ borderRadius: 8 }}
    >
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 8 }}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              <span className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase ${recommendationStyles[recommendation]}`} style={{ borderRadius: 6 }}>
                {recommendation === 'recommended' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {recommendationLabels[recommendation]}
              </span>
            </div>
            <p className="mt-0.5 max-w-4xl text-xs leading-5 text-slate-600">
              {description}
            </p>
            <p className={`mt-1 text-[11px] leading-4 ${
              noteTone === 'danger' ? 'font-bold text-red-700' : 'font-medium text-slate-500'
            }`}>
              {note}
            </p>
          </div>
        </div>

        {isLoading ? (
          <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-slate-400" />
        ) : (
          <button
            type="button"
            disabled={isSaving || disabled}
            onClick={onToggle}
            className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled ? 'bg-[#6b0f1a]' : 'bg-slate-300'
            }`}
            style={{ borderRadius: 8 }}
            aria-pressed={enabled}
            aria-label={`Toggle ${title}`}
          >
            <span
              className={`inline-block h-4 w-4 transform bg-white shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-1'
              }`}
              style={{ borderRadius: 7 }}
            />
          </button>
        )}
      </div>
      {children && (
        <div className="border-t border-slate-100 px-5 pb-4 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}

export default function SecretarySettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SchedulingSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  useEffect(() => {
    let active = true;

    api.get<SchedulingSettings>('/scheduling-settings')
      .then((response) => {
        if (active) {
          setSettings(response.data);
        }
      })
      .catch(() => toast.error('Error', 'Failed to load scheduling settings.'))
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [toast]);

  const updateSetting = async (patch: Partial<Pick<SchedulingSettings, 'lecture_lab_schedule_override_enabled' | 'custom_lab_duration_override_enabled' | 'custom_lab_duration_minutes' | 'custom_lab_duration_6_hours_enabled' | 'custom_lab_duration_5_hours_enabled' | 'custom_lab_duration_other_enabled' | 'gec_split_schedule_override_enabled' | 'field_evening_schedule_enabled' | 'sunday_online_only_enabled' | 'online_slot_limit' | 'field_slot_limit'>>) => {
    if (!settings) {
      return;
    }

    setIsSaving(true);
    const previous = settings;
    setSettings({ ...settings, ...patch });

    try {
      const response = await api.patch<SchedulingSettings>('/scheduling-settings', patch);
      setSettings(response.data);
      toast.success('Settings saved', 'Scheduling settings updated.');
    } catch (error) {
      setSettings(previous);
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error('Error', apiError.response?.data?.message ?? 'Failed to save scheduling settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const lectureLabEnabled = !!settings?.lecture_lab_schedule_override_enabled;
  const customLabEnabled = !!settings?.custom_lab_duration_override_enabled;
  const customLabMinutes = settings?.custom_lab_duration_minutes ?? 360;
  const customLab6HoursEnabled = !!settings?.custom_lab_duration_6_hours_enabled;
  const customLab5HoursEnabled = !!settings?.custom_lab_duration_5_hours_enabled;
  const customLabOtherEnabled = !!settings?.custom_lab_duration_other_enabled;
  const gecSplitEnabled = !!settings?.gec_split_schedule_override_enabled;
  const fieldEveningEnabled = !!settings?.field_evening_schedule_enabled;
  const sundayOnlineOnlyEnabled = settings?.sunday_online_only_enabled ?? true;
  const lectureLabAvailable = !!settings?.lecture_lab_available;
  const isLaboratoryProfile = settings?.scheduling_profile === 'laboratory_enabled';
  const profileLabel = isLaboratoryProfile ? 'Laboratory-enabled department' : 'Standard department';
  const profileDescription = isLaboratoryProfile
    ? 'Use lecture + laboratory controls for departments with practical and laboratory courses.'
    : 'Use standard lecture, online, and field controls. Laboratory overrides stay disabled for this profile.';
  const profileRecommendations = isLaboratoryProfile
    ? ['Apply Hybrid', 'Online and field slot limits', 'Sunday Online Only']
    : ['Online and field slot limits', 'Sunday Online Only', 'Split Units or GEC Split'];
  const handleDropdownToggle = (id: string) => {
    setOpenDropdown((current) => (current === id ? null : id));
  };
  const requestConfirmation = (confirmation: PendingConfirmation) => {
    setPendingConfirmation(confirmation);
  };
  const runConfirmedAction = () => {
    const action = pendingConfirmation?.onConfirm;
    setPendingConfirmation(null);
    action?.();
  };
  return (
    <div className="min-h-full bg-[#f7f8fa] p-1">
      <section className="mb-3 border border-slate-200 bg-white px-5 py-5 shadow-sm" style={{ borderRadius: 10 }}>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#6b0f1a] text-white" style={{ borderRadius: 8 }}>
              <Building2 size={19} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-slate-950">Department scheduling configuration</h1>
                <span className="inline-flex items-center gap-1 border border-[#6b0f1a]/20 bg-[#6b0f1a]/5 px-2 py-1 text-[10px] font-bold uppercase text-[#6b0f1a]" style={{ borderRadius: 6 }}>
                  <Info className="h-3 w-3" />
                  {profileLabel}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{profileDescription}</p>
            </div>
          </div>
          <div className="min-w-[260px] border-l-2 border-emerald-400 pl-4">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Recommended for this department
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profileRecommendations.map((item) => (
                <span key={item} className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800" style={{ borderRadius: 6 }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="grid max-w-8xl items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <div className="space-y-3">
          <SettingsDropdown
          id="configuration-override"
          title="Configuration Override"
          description="Manage course splitting and custom lab duration behavior."
          icon={SlidersHorizontal}
          isOpen={openDropdown === 'configuration-override'}
          onToggle={handleDropdownToggle}
        >
          <SettingToggleCard
            title="Apply Hybrid"
            recommendation={isLaboratoryProfile ? 'recommended' : 'not-applicable'}
            description="Split selected lecture + lab courses into separate lecture and laboratory meetings."
            note={lectureLabAvailable
              ? "Example: 2 Lecture + 1 Laboratory becomes 2 hrs lecture + 3 hrs laboratory."
              : "Unavailable: no active lecture + lab courses found."
            }
            enabled={lectureLabEnabled}
            isLoading={isLoading}
            isSaving={isSaving}
            disabled={!lectureLabAvailable || !isLaboratoryProfile}
            icon={FlaskConical}
            onToggle={() => {
              if (!lectureLabAvailable) return;
              if (!lectureLabEnabled) {
                requestConfirmation({
                  title: 'Enable Apply Hybrid?',
                  message: 'Only selected courses with both lecture and lab units will split.\n\nLab time may become longer, but curriculum units will not change.',
                  confirmLabel: 'Enable Hybrid',
                  variant: 'warning',
                  onConfirm: () => updateSetting({ lecture_lab_schedule_override_enabled: true }),
                });
                return;
              }
              requestConfirmation({
                title: 'Turn off Apply Hybrid?',
                message: 'Selected lecture + lab courses will no longer split into separate lecture and laboratory meetings during generation.\n\nCurriculum units remain unchanged.',
                confirmLabel: 'Turn Off',
                variant: 'maroon',
                onConfirm: () => updateSetting({ lecture_lab_schedule_override_enabled: false }),
              });
            }}
          />
          <SettingToggleCard
            title="GEC Split Override"
            recommendation="optional"
            description="Allow selected GEC courses to split into shorter meetings."
            note="Example: 3 units becomes two 1.5-hour sessions."
            enabled={gecSplitEnabled}
            isLoading={isLoading}
            isSaving={isSaving}
            icon={BookOpen}
            onToggle={() => {
              if (!gecSplitEnabled) {
                requestConfirmation({
                  title: 'Enable GEC Split Override?',
                  message: 'Only selected GEC courses can split into shorter meetings.\n\nOnly the GEC courses you select are affected.',
                  confirmLabel: 'Enable GEC Split',
                  variant: 'warning',
                  onConfirm: () => updateSetting({
                    gec_split_schedule_override_enabled: true,
                  }),
                });
                return;
              }
              requestConfirmation({
                title: 'Turn off GEC Split Override?',
                message: 'Selected GEC courses will stop splitting into shorter meetings during generation.\n\nExisting curriculum units remain unchanged.',
                confirmLabel: 'Turn Off',
                variant: 'maroon',
                onConfirm: () => updateSetting({
                  gec_split_schedule_override_enabled: false,
                }),
              });
            }}
          />
          <SettingToggleCard
            title="Allow Field Subjects in Evening"
            recommendation="optional"
            description="Allow field subjects to use the 5 PM to 7 PM range when daytime capacity is not enough."
            note="Disabled: field subjects are limited to 7 AM-5 PM. Enabled: 5 PM-7 PM is allowed but not preferred."
            enabled={fieldEveningEnabled}
            isLoading={isLoading}
            isSaving={isSaving}
            icon={TreePine}
            onToggle={() => {
              if (!fieldEveningEnabled) {
                requestConfirmation({
                  title: 'Allow field subjects in evening?',
                  message: 'Field subjects may use 5 PM-7 PM only as extra capacity. The generator will still prefer 7 AM-5 PM when possible.',
                  confirmLabel: 'Allow Evening',
                  variant: 'info',
                  onConfirm: () => updateSetting({ field_evening_schedule_enabled: true }),
                });
                return;
              }
              requestConfirmation({
                title: 'Disable field evening scheduling?',
                message: 'Field subjects will be limited to schedules ending by 5 PM during generation.',
                confirmLabel: 'Disable Evening',
                variant: 'maroon',
                onConfirm: () => updateSetting({ field_evening_schedule_enabled: false }),
              });
            }}
          />
          <SettingToggleCard
            title="Sunday Online Only"
            recommendation="recommended"
            description="Require Sunday major-course meetings to use online delivery."
            note="Enabled by default: Sunday schedules are online. Turn off only if your department allows physical Sunday classes."
            enabled={sundayOnlineOnlyEnabled}
            isLoading={isLoading}
            isSaving={isSaving}
            icon={CalendarDays}
            onToggle={() => {
              if (!sundayOnlineOnlyEnabled) {
                requestConfirmation({
                  title: 'Enable Sunday Online Only?',
                  message: 'Major courses scheduled on Sunday will be required to use online delivery.',
                  confirmLabel: 'Enable Rule',
                  variant: 'info',
                  onConfirm: () => updateSetting({ sunday_online_only_enabled: true }),
                });
                return;
              }
              requestConfirmation({
                title: 'Allow physical Sunday classes?',
                message: 'The generator and validator may allow on-site major-course meetings on Sunday for this department.',
                confirmLabel: 'Allow Sunday On-site',
                variant: 'warning',
                onConfirm: () => updateSetting({ sunday_online_only_enabled: false }),
              });
            }}
          />
          <section className="border border-slate-200 bg-white px-5 py-4 shadow-sm" style={{ borderRadius: 10 }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-950">Resource slot limits</h2>
                  <span className="border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700" style={{ borderRadius: 6 }}>Recommended</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Set how many sections from this department may share an ONLINE or FIELD time slot.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 8 }}>
                    <Wifi size={16} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Online slot limit</span>
                    <span className="block text-xs leading-5 text-slate-600">Concurrent online sections per time slot.</span>
                  </span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={isLoading || isSaving || !settings}
                  value={settings?.online_slot_limit ?? 3}
                  onChange={(event) => {
                    const value = Math.max(1, Math.min(100, Number(event.target.value) || 1));
                    setSettings((current) => current ? { ...current, online_slot_limit: value } : current);
                  }}
                  onBlur={(event) => updateSetting({ online_slot_limit: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })}
                  className="h-9 w-20 border border-slate-300 px-2 text-center text-sm font-semibold text-slate-900 outline-none focus:border-[#6b0f1a]"
                  style={{ borderRadius: 8 }}
                />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-emerald-50 text-emerald-700" style={{ borderRadius: 8 }}>
                    <TreePine size={16} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Field slot limit</span>
                    <span className="block text-xs leading-5 text-slate-600">Concurrent field sections per time slot.</span>
                  </span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={isLoading || isSaving || !settings}
                  value={settings?.field_slot_limit ?? 3}
                  onChange={(event) => {
                    const value = Math.max(1, Math.min(100, Number(event.target.value) || 1));
                    setSettings((current) => current ? { ...current, field_slot_limit: value } : current);
                  }}
                  onBlur={(event) => updateSetting({ field_slot_limit: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })}
                  className="h-9 w-20 border border-slate-300 px-2 text-center text-sm font-semibold text-slate-900 outline-none focus:border-[#6b0f1a]"
                  style={{ borderRadius: 8 }}
                />
              </label>
            </div>
          </section>
          <SettingToggleCard
            title="Custom Lab Duration"
            recommendation={isLaboratoryProfile ? 'optional' : 'not-applicable'}
            description="Allow selected lab courses to use custom lab meeting lengths."
            note="If Apply Hybrid is already active, use this only when the lab needs longer time."
            noteTone="danger"
            enabled={customLabEnabled}
            isLoading={isLoading}
            isSaving={isSaving}
            icon={SlidersHorizontal}
            disabled={!isLaboratoryProfile}
            onToggle={() => {
              if (!isLaboratoryProfile) return;
              if (!customLabEnabled) {
                requestConfirmation({
                  title: 'Enable Custom Lab Duration?',
                  message: 'Use this only when selected lab courses need 5, 6, or custom-hour sessions.\n\nIt can increase lab time beyond the normal Apply Hybrid override.',
                  confirmLabel: 'Enable Custom Lab',
                  variant: 'danger',
                  onConfirm: () => updateSetting({ custom_lab_duration_override_enabled: true }),
                });
                return;
              }
              requestConfirmation({
                title: 'Turn off Custom Lab Duration?',
                message: 'Custom 5-hour, 6-hour, or other lab duration choices will stop applying during schedule generation.',
                confirmLabel: 'Turn Off',
                variant: 'maroon',
                onConfirm: () => updateSetting({ custom_lab_duration_override_enabled: false }),
              });
            }}
          >
          {customLabEnabled && (
            <>
              <div className="grid gap-2 md:grid-cols-3">
              {[
                {
                  label: '6-hour duration',
                  description: 'Allow 6-hour lab sessions.',
                  checked: customLab6HoursEnabled,
                  patch: { custom_lab_duration_6_hours_enabled: !customLab6HoursEnabled },
                },
                {
                  label: '5-hour duration',
                  description: 'Allow 5-hour lab sessions.',
                  checked: customLab5HoursEnabled,
                  patch: { custom_lab_duration_5_hours_enabled: !customLab5HoursEnabled },
                },
                {
                  label: 'Other duration',
                  description: 'Allow a custom lab duration.',
                  checked: customLabOtherEnabled,
                  patch: { custom_lab_duration_other_enabled: !customLabOtherEnabled },
                },
              ].map((option) => {
                return (
                  <label
                    key={option.label}
                    className={`flex min-h-[62px] items-start gap-2.5 border bg-white p-2.5 transition-colors ${
                      customLabEnabled ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-60'
                    }`}
                    style={{ borderRadius: 8 }}
                  >
                    <input
                      type="checkbox"
                      checked={option.checked}
                      disabled={isLoading || isSaving || !customLabEnabled}
                      onChange={() => updateSetting(option.patch)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#6b0f1a] focus:ring-[#6b0f1a] disabled:cursor-not-allowed"
                    />
                    <span>
                      <span className="block text-xs font-bold text-slate-800">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{option.description}</span>
                    </span>
                  </label>
                );
              })}
              </div>
              {customLabOtherEnabled && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Other value</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    step={0.5}
                    disabled={isLoading || isSaving}
                    value={customLabMinutes / 60}
                    onChange={(event) => {
                      const hours = Number(event.target.value);
                      if (!Number.isFinite(hours) || hours <= 0) return;
                      updateSetting({ custom_lab_duration_minutes: Math.round(hours * 60) });
                    }}
                    className="h-8 w-20 border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#6b0f1a] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    style={{ borderRadius: 8 }}
                  />
                  <span className="text-xs font-semibold text-slate-500">hours</span>
                </div>
              )}
            </>
          )}
          </SettingToggleCard>
          </SettingsDropdown>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-3">
          <section className="border border-slate-200 bg-white p-4 shadow-sm" style={{ borderRadius: 8 }}>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center bg-slate-900 text-white" style={{ borderRadius: 7 }}>
                <Gauge size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-950">Current capacity</h2>
                <p className="text-xs text-slate-500">Applied independently to this department.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="border border-sky-200 bg-sky-50 p-3" style={{ borderRadius: 7 }}>
                <div className="text-[10px] font-bold uppercase text-sky-700">Online</div>
                <div className="mt-1 text-2xl font-bold text-slate-950">{settings?.online_slot_limit ?? 3}</div>
                <div className="text-[11px] text-slate-600">sections per slot</div>
              </div>
              <div className="border border-emerald-200 bg-emerald-50 p-3" style={{ borderRadius: 7 }}>
                <div className="text-[10px] font-bold uppercase text-emerald-700">Field</div>
                <div className="mt-1 text-2xl font-bold text-slate-950">{settings?.field_slot_limit ?? 3}</div>
                <div className="text-[11px] text-slate-600">sections per slot</div>
              </div>
            </div>
          </section>
          <section className="border border-slate-200 bg-white p-4 shadow-sm" style={{ borderRadius: 8 }}>
            <h2 className="text-sm font-bold text-slate-950">Profile guide</h2>
            <div className="mt-3 space-y-3">
              {(isLaboratoryProfile ? [
                ['Apply Hybrid', 'Enable when courses contain both lecture and laboratory hours.'],
                ['Custom Lab Duration', 'Use only for exceptional five-hour, six-hour, or custom sessions.'],
                ['Split Units / GEC', 'Optional for courses that need shorter recurring meetings.'],
              ] : [
                ['Laboratory controls', 'Keep disabled. Standard departments do not require laboratory resources.'],
                ['Split Units / GEC', 'Choose one when shorter recurring meetings improve the timetable.'],
                ['Online / Field capacity', 'Set limits based on this department’s actual section volume.'],
              ]).map(([label, detail], index) => (
                <div key={label} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700" style={{ borderRadius: 6 }}>
                    {index + 1}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-slate-800">{label}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-slate-500">{detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <ConfirmModal
        isOpen={!!pendingConfirmation}
        eyebrow="Scheduling Setting"
        title={pendingConfirmation?.title ?? ''}
        message={pendingConfirmation?.message ?? ''}
        confirmLabel={pendingConfirmation?.confirmLabel ?? 'Confirm'}
        cancelLabel="Cancel"
        variant={pendingConfirmation?.variant ?? 'warning'}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={runConfirmedAction}
      />
    </div>
  );
}
