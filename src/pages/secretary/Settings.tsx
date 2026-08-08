import type React from 'react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, FlaskConical, Loader2, SlidersHorizontal, SplitSquareVertical } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface SchedulingSettings {
  department_id: number;
  lecture_lab_schedule_override_enabled: boolean;
  split_units_schedule_override_enabled: boolean;
  custom_lab_duration_override_enabled: boolean;
  custom_lab_duration_minutes: number | null;
  custom_lab_duration_6_hours_enabled: boolean;
  custom_lab_duration_5_hours_enabled: boolean;
  custom_lab_duration_other_enabled: boolean;
  gec_split_schedule_override_enabled: boolean;
  lecture_lab_available: boolean;
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
}: SettingToggleCardProps) {
  return (
    <section className="border border-slate-200 bg-white shadow-sm" style={{ borderRadius: 10 }}>
      <div className="flex items-start justify-between gap-6 p-6">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 10 }}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              {description}
            </p>
            <p className={`mt-2 text-xs ${
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
            className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled ? 'bg-[#6b0f1a]' : 'bg-slate-300'
            }`}
            style={{ borderRadius: 10 }}
            aria-pressed={enabled}
            aria-label={`Toggle ${title}`}
          >
            <span
              className={`inline-block h-5 w-5 transform bg-white shadow transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
              style={{ borderRadius: 10 }}
            />
          </button>
        )}
      </div>
      {children && (
        <div className="border-t border-slate-100 px-6 pb-6 pt-4">
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

  const updateSetting = async (patch: Partial<Pick<SchedulingSettings, 'lecture_lab_schedule_override_enabled' | 'split_units_schedule_override_enabled' | 'custom_lab_duration_override_enabled' | 'custom_lab_duration_minutes' | 'custom_lab_duration_6_hours_enabled' | 'custom_lab_duration_5_hours_enabled' | 'custom_lab_duration_other_enabled' | 'gec_split_schedule_override_enabled'>>) => {
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
    } catch {
      setSettings(previous);
      toast.error('Error', 'Failed to save scheduling settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const lectureLabEnabled = !!settings?.lecture_lab_schedule_override_enabled;
  const splitUnitsEnabled = !!settings?.split_units_schedule_override_enabled;
  const customLabEnabled = !!settings?.custom_lab_duration_override_enabled;
  const customLabMinutes = settings?.custom_lab_duration_minutes ?? 360;
  const customLab6HoursEnabled = !!settings?.custom_lab_duration_6_hours_enabled;
  const customLab5HoursEnabled = !!settings?.custom_lab_duration_5_hours_enabled;
  const customLabOtherEnabled = !!settings?.custom_lab_duration_other_enabled;
  const gecSplitEnabled = !!settings?.gec_split_schedule_override_enabled;
  const lectureLabAvailable = !!settings?.lecture_lab_available;

  return (
    <div className="p-2">
      <div className="max-w-8xl space-y-5 rounded-xl shadow-sm sm">
        <SettingToggleCard
          title="Lecture + Laboratory Override"
          description="Split selected lecture + lab courses into separate lecture and laboratory meetings."
          note={lectureLabAvailable
            ? "Example: 2 Lecture + 1 Laboratory becomes 2 hrs lecture + 3 hrs laboratory."
            : "Unavailable: no active lecture + lab courses found."
          }
          enabled={lectureLabEnabled}
          isLoading={isLoading}
          isSaving={isSaving}
          disabled={!lectureLabAvailable}
          icon={FlaskConical}
          onToggle={() => {
            if (!lectureLabAvailable) return;
            updateSetting({ lecture_lab_schedule_override_enabled: !lectureLabEnabled });
          }}
        />
        <SettingToggleCard
          title="Split Units Override"
          description="Split selected courses into unit-based sessions."
          note="Example: 3 units becomes two 1.5-hour meetings."
          enabled={splitUnitsEnabled}
          isLoading={isLoading}
          isSaving={isSaving}
          icon={SplitSquareVertical}
          onToggle={() => updateSetting({
            split_units_schedule_override_enabled: !splitUnitsEnabled,
            ...(!splitUnitsEnabled ? { gec_split_schedule_override_enabled: false } : {}),
          })}
        />
        <SettingToggleCard
          title="GEC Split Override"
          description="Allow selected GEC courses to split into shorter meetings."
          note="Example: 3 units becomes two 1.5-hour sessions."
          enabled={gecSplitEnabled}
          isLoading={isLoading}
          isSaving={isSaving}
          icon={BookOpen}
          onToggle={() => updateSetting({
            gec_split_schedule_override_enabled: !gecSplitEnabled,
            ...(!gecSplitEnabled ? { split_units_schedule_override_enabled: false } : {}),
          })}
        />
        <SettingToggleCard
          title="Custom Lab Duration"
          description="Allow selected lab courses to use custom lab meeting lengths."
          note="If Lecture + Lab is already active, use this only when the lab needs longer time."
          noteTone="danger"
          enabled={customLabEnabled}
          isLoading={isLoading}
          isSaving={isSaving}
          icon={SlidersHorizontal}
          onToggle={() => updateSetting({ custom_lab_duration_override_enabled: !customLabEnabled })}
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
                    className={`flex min-h-[74px] items-start gap-3 border bg-white p-3 transition-colors ${
                      customLabEnabled ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-60'
                    }`}
                    style={{ borderRadius: 10 }}
                  >
                    <input
                      type="checkbox"
                      checked={option.checked}
                      disabled={isLoading || isSaving || !customLabEnabled}
                      onChange={() => updateSetting(option.patch)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#6b0f1a] focus:ring-[#6b0f1a] disabled:cursor-not-allowed"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{option.label}</span>
                      <span className="mt-1 block text-xs text-slate-500">{option.description}</span>
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
                    className="h-9 w-24 border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#6b0f1a] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    style={{ borderRadius: 10 }}
                  />
                  <span className="text-xs font-semibold text-slate-500">hours</span>
                </div>
              )}
            </>
          )}
        </SettingToggleCard>
      </div>
    </div>
  );
}
