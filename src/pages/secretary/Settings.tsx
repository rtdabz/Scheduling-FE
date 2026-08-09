import type React from 'react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, CalendarDays, ChevronDown, FlaskConical, Loader2, Plus, SlidersHorizontal, SplitSquareVertical, Trash2, TreePine } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import ConfirmModal from '../../components/ui/ConfirmModal';

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
  force_schedule_reuse_enabled: boolean;
  lecture_lab_available: boolean;
  forced_day_courses: ForcedDayCourse[];
  forced_day_rules: ForcedDayRule[];
  forced_schedule_course_options: ForcedDayCourse[];
  forced_schedule_course_codes: string[];
  field_course_assignment_enabled: boolean;
  field_course_options: ForcedDayCourse[];
  field_course_codes: string[];
}

interface ForcedDayCourse {
  id: number;
  code: string;
  name: string;
}

interface ForcedDayRule {
  course_id: number;
  day: string;
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
}: SettingToggleCardProps) {
  return (
    <section className="border border-slate-200 bg-white shadow-sm" style={{ borderRadius: 10 }}>
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 8 }}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
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
  const [isFieldCoursePickerOpen, setIsFieldCoursePickerOpen] = useState(false);
  const [fieldCourseSearch, setFieldCourseSearch] = useState('');

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

  const updateSetting = async (patch: Partial<Pick<SchedulingSettings, 'lecture_lab_schedule_override_enabled' | 'split_units_schedule_override_enabled' | 'custom_lab_duration_override_enabled' | 'custom_lab_duration_minutes' | 'custom_lab_duration_6_hours_enabled' | 'custom_lab_duration_5_hours_enabled' | 'custom_lab_duration_other_enabled' | 'gec_split_schedule_override_enabled' | 'force_schedule_reuse_enabled' | 'forced_day_rules' | 'forced_schedule_course_codes' | 'field_course_assignment_enabled' | 'field_course_codes'>>) => {
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
  const forcedDayCourses = settings?.forced_day_courses ?? [];
  const forcedDayRules = settings?.forced_day_rules ?? [];
  const forcedScheduleCourseOptions = settings?.forced_schedule_course_options ?? [];
  const forcedScheduleCourseCodes = settings?.forced_schedule_course_codes ?? [];
  const fieldCourseAssignmentEnabled = !!settings?.field_course_assignment_enabled;
  const fieldCourseOptions = settings?.field_course_options ?? [];
  const fieldCourseCodes = settings?.field_course_codes ?? [];
  const availableForcedDayCourses = forcedDayCourses.filter(
    (course) => !forcedDayRules.some((rule) => rule.course_id === course.id)
  );
  const availableForcedScheduleCourses = forcedScheduleCourseOptions.filter(
    (course) => !forcedScheduleCourseCodes.includes(course.code)
  );
  const availableFieldCourses = fieldCourseOptions.filter(
    (course) => !fieldCourseCodes.includes(course.code)
  );
  const filteredAvailableFieldCourses = availableFieldCourses.filter((course) => {
    const term = fieldCourseSearch.trim().toLowerCase();
    if (!term) return true;
    return course.code.toLowerCase().includes(term) || course.name.toLowerCase().includes(term);
  });
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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
  const saveForcedDayRules = (nextRules: ForcedDayRule[]) => {
    updateSetting({ forced_day_rules: nextRules });
  };
  const saveForcedScheduleCourseCodes = (nextCourseCodes: string[]) => {
    updateSetting({ forced_schedule_course_codes: nextCourseCodes });
  };
  const saveFieldCourseCodes = (nextCourseCodes: string[]) => {
    updateSetting({ field_course_codes: nextCourseCodes });
  };

  return (
    <div className="p-1">
      <div className="grid max-w-8xl items-start gap-3 rounded-xl shadow-sm lg:grid-cols-2">
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
              if (!lectureLabEnabled) {
                requestConfirmation({
                  title: 'Enable Lecture + Laboratory Override?',
                  message: 'Only selected courses with both lecture and lab units will split.\n\nLab time may become longer, but curriculum units will not change.',
                  confirmLabel: 'Enable Override',
                  variant: 'warning',
                  onConfirm: () => updateSetting({ lecture_lab_schedule_override_enabled: true }),
                });
                return;
              }
              requestConfirmation({
                title: 'Turn off Lecture + Laboratory Override?',
                message: 'Selected lecture + lab courses will no longer split into separate lecture and laboratory meetings during generation.\n\nCurriculum units remain unchanged.',
                confirmLabel: 'Turn Off',
                variant: 'maroon',
                onConfirm: () => updateSetting({ lecture_lab_schedule_override_enabled: false }),
              });
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
            onToggle={() => {
              if (!splitUnitsEnabled) {
                requestConfirmation({
                  title: 'Enable Split Units Override?',
                  message: 'Selected courses can be divided into unit-based meetings during generation.\n\nThis will replace GEC Split because Split Units already covers that behavior.',
                  confirmLabel: 'Enable Split Units',
                  variant: 'warning',
                  onConfirm: () => updateSetting({
                    split_units_schedule_override_enabled: true,
                    gec_split_schedule_override_enabled: false,
                  }),
                });
                return;
              }
              requestConfirmation({
                title: 'Turn off Split Units Override?',
                message: 'Selected courses will stop splitting into unit-based meetings during generation.\n\nExisting curriculum units remain unchanged.',
                confirmLabel: 'Turn Off',
                variant: 'maroon',
                onConfirm: () => updateSetting({
                  split_units_schedule_override_enabled: false,
                }),
              });
            }}
          />
          <SettingToggleCard
            title="GEC Split Override"
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
                  message: 'Only selected GEC courses can split into shorter meetings.\n\nThis will replace Split Units to avoid duplicate split rules.',
                  confirmLabel: 'Enable GEC Split',
                  variant: 'warning',
                  onConfirm: () => updateSetting({
                    gec_split_schedule_override_enabled: true,
                    split_units_schedule_override_enabled: false,
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
            title="Custom Lab Duration"
            description="Allow selected lab courses to use custom lab meeting lengths."
            note="If Lecture + Lab is already active, use this only when the lab needs longer time."
            noteTone="danger"
            enabled={customLabEnabled}
            isLoading={isLoading}
            isSaving={isSaving}
            icon={SlidersHorizontal}
            onToggle={() => {
              if (!customLabEnabled) {
                requestConfirmation({
                  title: 'Enable Custom Lab Duration?',
                  message: 'Use this only when selected lab courses need 5, 6, or custom-hour sessions.\n\nIt can increase lab time beyond the normal Lecture + Lab override.',
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

          <SettingsDropdown
            id="forced-day-schedule"
            title="Forced Day Schedule"
            description="Assign selected courses to a required generation day."
            icon={CalendarDays}
            isOpen={openDropdown === 'forced-day-schedule'}
            onToggle={handleDropdownToggle}
          >
            <section className="border border-slate-200 bg-white shadow-sm" style={{ borderRadius: 10 }}>
              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 8 }}>
                    <BookOpen size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Forced Schedule Courses</h2>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">
                      Add course codes that must be included when generation runs.
                    </p>
                    <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500">
                      Selection is based on course code.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {forcedScheduleCourseCodes.length === 0 ? (
                    <div className="border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-500" style={{ borderRadius: 8 }}>
                      No forced schedule courses yet.
                    </div>
                  ) : (
                    forcedScheduleCourseCodes.map((courseCode, index) => {
                      const selectedCourse = forcedScheduleCourseOptions.find((course) => course.code === courseCode);
                      return (
                        <div key={`${courseCode}-${index}`} className="grid gap-2 border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_32px]" style={{ borderRadius: 8 }}>
                          <select
                            value={courseCode}
                            disabled={isSaving}
                            onChange={(event) => {
                              const nextCode = event.target.value;
                              requestConfirmation({
                                title: `Use ${nextCode} as a forced course?`,
                                message: 'This course code will be included automatically during generation.',
                                confirmLabel: 'Save Course',
                                variant: 'info',
                                onConfirm: () => saveForcedScheduleCourseCodes(forcedScheduleCourseCodes.map((item, itemIndex) =>
                                  itemIndex === index ? nextCode : item
                                )),
                              });
                            }}
                            className="h-9 min-w-0 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#6b0f1a] disabled:cursor-not-allowed disabled:bg-slate-50"
                            style={{ borderRadius: 8 }}
                          >
                            {selectedCourse && (
                              <option value={selectedCourse.code}>{selectedCourse.code} - {selectedCourse.name}</option>
                            )}
                            {availableForcedScheduleCourses.map((course) => (
                              <option key={course.id} value={course.code}>{course.code} - {course.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => saveForcedScheduleCourseCodes(forcedScheduleCourseCodes.filter((_, itemIndex) => itemIndex !== index))}
                            className="flex h-9 items-center justify-center border border-red-100 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ borderRadius: 8 }}
                            aria-label="Remove forced schedule course"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSaving || availableForcedScheduleCourses.length === 0}
                  onClick={() => {
                    const nextCourse = availableForcedScheduleCourses[0];
                    if (!nextCourse) return;
                    requestConfirmation({
                      title: `Add ${nextCourse.code} as a forced course?`,
                      message: 'This course code will always be included when generation runs for matching curriculum schedules.',
                      confirmLabel: 'Add Course',
                      variant: 'info',
                      onConfirm: () => saveForcedScheduleCourseCodes([...forcedScheduleCourseCodes, nextCourse.code]),
                    });
                  }}
                  className="mt-3 inline-flex h-9 items-center gap-2 border border-[#6b0f1a]/20 bg-[#6b0f1a]/5 px-3 text-xs font-bold text-[#6b0f1a] transition-colors hover:bg-[#6b0f1a]/10 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderRadius: 8 }}
                >
                  <Plus size={14} />
                  Add Course Code
                </button>
              </div>
            </section>

            <section className="border border-slate-200 bg-white shadow-sm" style={{ borderRadius: 10 }}>
              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 8 }}>
                    <CalendarDays size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Forced Day Rules</h2>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">
                      Choose only the courses that must stay on a specific day.
                    </p>
                    <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500">
                      Example: force NSTP, ROTC, CWTS, or LTS to Saturday when required.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {forcedDayRules.length === 0 ? (
                    <div className="border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-500" style={{ borderRadius: 8 }}>
                      No forced day rules yet.
                    </div>
                  ) : (
                    forcedDayRules.map((rule, index) => {
                      const selectedCourse = forcedDayCourses.find((course) => course.id === rule.course_id);
                      return (
                        <div key={`${rule.course_id}-${index}`} className="grid gap-2 border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_150px_32px]" style={{ borderRadius: 8 }}>
                          <select
                            value={rule.course_id}
                            disabled={isSaving}
                            onChange={(event) => {
                              const courseId = Number(event.target.value);
                              const nextCourse = forcedDayCourses.find((course) => course.id === courseId);
                              requestConfirmation({
                                title: `Force ${nextCourse?.code ?? 'this course'} to a day?`,
                                message: 'Only use this for courses that must be generated on one required day.',
                                confirmLabel: 'Save Rule',
                                variant: 'warning',
                                onConfirm: () => saveForcedDayRules(forcedDayRules.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, course_id: courseId } : item
                                )),
                              });
                            }}
                            className="h-9 min-w-0 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#6b0f1a] disabled:cursor-not-allowed disabled:bg-slate-50"
                            style={{ borderRadius: 8 }}
                          >
                            {selectedCourse && (
                              <option value={selectedCourse.id}>{selectedCourse.code} - {selectedCourse.name}</option>
                            )}
                            {availableForcedDayCourses.map((course) => (
                              <option key={course.id} value={course.id}>{course.code} - {course.name}</option>
                            ))}
                          </select>
                          <select
                            value={rule.day}
                            disabled={isSaving}
                            onChange={(event) => {
                              const nextDay = event.target.value;
                              requestConfirmation({
                                title: `Force this course to ${nextDay}?`,
                                message: 'The generator will try to keep this selected course on that day.',
                                confirmLabel: 'Save Day',
                                variant: 'warning',
                                onConfirm: () => saveForcedDayRules(forcedDayRules.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, day: nextDay } : item
                                )),
                              });
                            }}
                            className="h-9 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#6b0f1a] disabled:cursor-not-allowed disabled:bg-slate-50"
                            style={{ borderRadius: 8 }}
                          >
                            {days.map((day) => (
                              <option key={day} value={day}>{day}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => saveForcedDayRules(forcedDayRules.filter((_, itemIndex) => itemIndex !== index))}
                            className="flex h-9 items-center justify-center border border-red-100 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ borderRadius: 8 }}
                            aria-label="Remove forced day rule"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSaving || availableForcedDayCourses.length === 0}
                  onClick={() => {
                    const nextCourse = availableForcedDayCourses[0];
                    if (!nextCourse) return;
                    requestConfirmation({
                      title: `Force ${nextCourse.code} to Saturday?`,
                      message: 'Use this only for courses that must stay on a specific day, such as NSTP, ROTC, CWTS, or LTS when required.',
                      confirmLabel: 'Add Rule',
                      variant: 'warning',
                      onConfirm: () => saveForcedDayRules([...forcedDayRules, { course_id: nextCourse.id, day: 'Saturday' }]),
                    });
                  }}
                  className="mt-3 inline-flex h-9 items-center gap-2 border border-[#6b0f1a]/20 bg-[#6b0f1a]/5 px-3 text-xs font-bold text-[#6b0f1a] transition-colors hover:bg-[#6b0f1a]/10 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderRadius: 8 }}
                >
                  <Plus size={14} />
                  Add Course Day
                </button>
              </div>
            </section>
          </SettingsDropdown>
        </div>

        <div className="space-y-3">
          <SettingsDropdown
          id="field-based-scheduling"
          title="Field-Based Scheduling"
          description="Manage course codes that should be treated as FIELD schedules."
          icon={TreePine}
          isOpen={openDropdown === 'field-based-scheduling'}
          onToggle={handleDropdownToggle}
        >
          <SettingToggleCard
            title="Field-Based Course Assignment"
            description="Treat selected course codes as FIELD schedules across all departments."
            note="When off, selected courses can use lecture rooms or online delivery, but not laboratories unless the course requires a lab."
            enabled={fieldCourseAssignmentEnabled}
            isLoading={isLoading}
            isSaving={isSaving}
            icon={TreePine}
            onToggle={() => {
              if (!fieldCourseAssignmentEnabled) {
                requestConfirmation({
                  title: 'Enable Field-Based Course Assignment?',
                  message: 'Selected course codes will automatically use FIELD during schedule generation and manual placement.',
                  confirmLabel: 'Enable Field Policy',
                  variant: 'warning',
                  onConfirm: () => updateSetting({ field_course_assignment_enabled: true }),
                });
                return;
              }
              requestConfirmation({
                title: 'Turn off Field-Based Course Assignment?',
                message: 'Selected course codes will no longer be forced to FIELD. They can use classrooms or online delivery while staying conflict-free.',
                confirmLabel: 'Turn Off',
                variant: 'maroon',
                onConfirm: () => updateSetting({ field_course_assignment_enabled: false }),
              });
            }}
          >
            <div className="space-y-2">
              {fieldCourseCodes.length === 0 ? (
                <div className="border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-500" style={{ borderRadius: 8 }}>
                  No field-based courses selected.
                </div>
              ) : (
                fieldCourseCodes.map((courseCode, index) => {
                  const selectedCourse = fieldCourseOptions.find((course) => course.code === courseCode);
                  return (
                    <div key={`${courseCode}-${index}`} className="grid gap-2 border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_32px]" style={{ borderRadius: 8 }}>
                      <select
                        value={courseCode}
                        disabled={isSaving}
                        onChange={(event) => {
                          const nextCode = event.target.value;
                          requestConfirmation({
                            title: `Treat ${nextCode} as field-based?`,
                            message: 'This course code will automatically use FIELD while the field-course policy is enabled.',
                            confirmLabel: 'Save Course',
                            variant: 'info',
                            onConfirm: () => saveFieldCourseCodes(fieldCourseCodes.map((item, itemIndex) =>
                              itemIndex === index ? nextCode : item
                            )),
                          });
                        }}
                        className="h-9 min-w-0 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#6b0f1a] disabled:cursor-not-allowed disabled:bg-slate-50"
                        style={{ borderRadius: 8 }}
                      >
                        {selectedCourse && (
                          <option value={selectedCourse.code}>{selectedCourse.code} - {selectedCourse.name}</option>
                        )}
                        {availableFieldCourses.map((course) => (
                          <option key={course.id} value={course.code}>{course.code} - {course.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => saveFieldCourseCodes(fieldCourseCodes.filter((_, itemIndex) => itemIndex !== index))}
                        className="flex h-9 items-center justify-center border border-red-100 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ borderRadius: 8 }}
                        aria-label="Remove field-based course"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <button
              type="button"
              disabled={isSaving || availableFieldCourses.length === 0}
              onClick={() => {
                setFieldCourseSearch('');
                setIsFieldCoursePickerOpen(true);
              }}
              className="mt-3 inline-flex h-9 items-center gap-2 border border-[#6b0f1a]/20 bg-[#6b0f1a]/5 px-3 text-xs font-bold text-[#6b0f1a] transition-colors hover:bg-[#6b0f1a]/10 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ borderRadius: 8 }}
            >
              <Plus size={14} />
              Add Field Course
            </button>
          </SettingToggleCard>
          </SettingsDropdown>
        </div>
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
      {isFieldCoursePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsFieldCoursePickerOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden bg-white shadow-2xl" style={{ borderRadius: 10 }}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 8 }}>
                  <TreePine size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Choose Field-Based Course</h2>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    Select the course code that should automatically use FIELD.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFieldCoursePickerOpen(false)}
                className="h-8 px-3 text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <input
                value={fieldCourseSearch}
                onChange={(event) => setFieldCourseSearch(event.target.value)}
                placeholder="Search course code or name"
                className="h-10 w-full border border-slate-200 px-3 text-sm font-medium text-slate-700 outline-none focus:border-[#6b0f1a]"
                style={{ borderRadius: 8 }}
                autoFocus
              />
              <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
                {filteredAvailableFieldCourses.length === 0 ? (
                  <div className="border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500" style={{ borderRadius: 8 }}>
                    No available course codes found.
                  </div>
                ) : (
                  filteredAvailableFieldCourses.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setIsFieldCoursePickerOpen(false);
                        requestConfirmation({
                          title: `Add ${course.code} as field-based?`,
                          message: 'This course code will automatically use FIELD while the field-course policy is enabled.',
                          confirmLabel: 'Add Course',
                          variant: 'info',
                          onConfirm: () => saveFieldCourseCodes([...fieldCourseCodes, course.code]),
                        });
                      }}
                      className="flex w-full items-center justify-between gap-3 border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-[#6b0f1a]/30 hover:bg-[#6b0f1a]/5 disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ borderRadius: 8 }}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-slate-900">{course.code}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{course.name}</span>
                      </span>
                      <Plus size={14} className="shrink-0 text-[#6b0f1a]" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
