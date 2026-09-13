import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Lock,
  Search,
  RotateCcw,
  Save,
  Check,
  CalendarDays,
  Sparkles,
  GraduationCap,
  Send,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Info,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import ProfileAvatar from '../../components/ui/ProfileAvatar';
import Skeleton from '../../components/ui/Skeleton';

export interface MatrixUser {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  department?: string | null;
  program_id?: number | string | null;
  profile_picture?: string | null;
  status: 'Active' | 'Inactive';
  permissions?: string[];
}

interface UserAccessMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: MatrixUser;
  onSuccess: (updatedPermissions: string[]) => void;
}

interface UserPermissionsApiResponse {
  user_id: number;
  inherited: string[];
  direct: string[];
  effective: string[];
  catalog: string[];
  catalog_metadata: CapabilityDefinition[];
  modules: ModuleDefinition[];
  presets: Record<string, { label: string; permissions: string[] }>;
}

interface CapabilityDefinition {
  id: string;
  module: string;
  title: string;
  description: string;
  assignable?: boolean;
  /** Capabilities this one cannot be exercised without; the server grants them alongside it. */
  requires?: string[];
}

interface ModuleDefinition {
  id: string;
  title: string;
  description: string;
  capabilities: Array<CapabilityDefinition & { granted?: boolean }>;
  granted?: boolean;
}

const MODULE_ICONS: Record<string, typeof CalendarDays> = {
  schedule_workspace: CalendarDays,
  recommendations: Sparkles,
  instructor_assignment: GraduationCap,
  submission_workflow: Send,
  approval_workflow: ShieldCheck,
};

export default function UserAccessMatrixModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: UserAccessMatrixModalProps) {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inheritedPermissions, setInheritedPermissions] = useState<string[]>([]);
  const [savedDirectPermissions, setSavedDirectPermissions] = useState<string[]>([]);
  const [directPermissions, setDirectPermissions] = useState<string[]>([]);
  const [modules, setModules] = useState<ModuleDefinition[]>([]);
  const [catalogMetadata, setCatalogMetadata] = useState<CapabilityDefinition[]>([]);
  const [presets, setPresets] = useState<Record<string, { label: string; permissions: string[] }>>({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    api
      .get<UserPermissionsApiResponse>(`/user/${user.id}/permissions`)
      .then((res) => {
        if (!isMounted) return;
        setInheritedPermissions(res.data.inherited || []);
        setSavedDirectPermissions(res.data.direct || []);
        setDirectPermissions(res.data.direct || []);
        const metadata = res.data.catalog_metadata || [];
        const apiModules = res.data.modules || [];
        setModules(apiModules.map((module) => ({
          ...module,
          capabilities: module.capabilities?.length
            ? module.capabilities
            : metadata.filter((capability) => capability.module === module.id),
        })));
        setCatalogMetadata(metadata);
        setPresets(res.data.presets || {});
      })
      .catch(() => {
        if (!isMounted) return;
        setError('Failed to load user permissions matrix.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, user.id]);

  // Effective permissions = union of role inherited + direct
  const effectivePermissions = useMemo(() => {
    return Array.from(new Set([...inheritedPermissions, ...directPermissions]));
  }, [inheritedPermissions, directPermissions]);

  const hasUnsavedChanges = useMemo(() => {
    const s1 = [...savedDirectPermissions].sort().join(',');
    const s2 = [...directPermissions].sort().join(',');
    return s1 !== s2;
  }, [savedDirectPermissions, directPermissions]);

  const currentPresetKey = useMemo(() => {
    const currentEffective = [...effectivePermissions].sort().join(',');

    for (const [key, preset] of Object.entries(presets)) {
      const presetEffective = Array.from(
        new Set([...inheritedPermissions, ...preset.permissions])
      )
        .sort()
        .join(',');
      if (currentEffective === presetEffective) {
        return key;
      }
    }

    if (directPermissions.length === 0) {
      return 'defaults';
    }

    return 'custom';
  }, [effectivePermissions, inheritedPermissions, directPermissions, presets]);

  /** The capability plus everything it depends on, transitively. Mirrors CapabilityRegistry::expand. */
  const withPrerequisites = useCallback(
    (permissionIds: string[]): string[] => {
      const resolved: string[] = [];
      const queue = [...permissionIds];
      while (queue.length > 0) {
        const id = queue.shift() as string;
        if (resolved.includes(id)) continue;
        resolved.push(id);
        const definition = catalogMetadata.find((capability) => capability.id === id);
        queue.push(...(definition?.requires ?? []));
      }
      return resolved;
    },
    [catalogMetadata],
  );

  /** Capabilities currently selected that would break if `permissionId` were revoked. */
  const dependentsOf = useCallback(
    (permissionId: string, selected: string[]): string[] =>
      selected.filter(
        (id) => id !== permissionId && withPrerequisites([id]).includes(permissionId),
      ),
    [withPrerequisites],
  );

  const toggleDirectPermission = (permissionId: string) => {
    // If inherited, locked and cannot be toggled off directly
    const definition = catalogMetadata.find((capability) => capability.id === permissionId);
    if (inheritedPermissions.includes(permissionId) || definition?.assignable === false) return;

    setDirectPermissions((prev) => {
      if (prev.includes(permissionId)) {
        // Revoking a prerequisite would leave its dependents granted but unusable --
        // the server expands the grant back anyway, so refuse the toggle instead of
        // showing a state that will not survive the save.
        if (dependentsOf(permissionId, prev).length > 0) {
          return prev;
        }
        return prev.filter((p) => p !== permissionId);
      }
      // Granting pulls in what the capability cannot run without, matching what
      // the server will store.
      const additions = withPrerequisites([permissionId]).filter((id) => !prev.includes(id));
      return [...prev, ...additions];
    });
  };

  const applyPreset = (presetKey: string | 'defaults') => {
    if (presetKey === 'defaults') {
      setDirectPermissions([]);
      return;
    }

    const targetPermissions = presets[presetKey]?.permissions ?? [];
    // Keep only direct permissions that aren't already inherited (or set all target direct)
    setDirectPermissions(withPrerequisites(targetPermissions));
  };

  const handleResetToSaved = () => {
    setDirectPermissions(savedDirectPermissions);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await api.patch<{
        message: string;
        data: { effective: string[]; direct: string[]; inherited: string[] };
      }>(`/user/${user.id}/permissions`, {
        permissions: directPermissions,
      });

      const updatedEffective = response.data.data.effective;
      setSavedDirectPermissions(response.data.data.direct);
      setInheritedPermissions(response.data.data.inherited);
      toast.success('Access Updated', `Permissions updated successfully for ${user.name}.`);
      onSuccess(updatedEffective);
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      const msg = apiErr.response?.data?.message || 'Failed to save access permissions.';
      setError(msg);
      toast.error('Save Failed', msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter groups and capabilities based on search
  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return modules;

    return modules.map((group) => {
      const matchedCaps = group.capabilities.filter(
        (cap) =>
          cap.title.toLowerCase().includes(q) ||
          cap.id.toLowerCase().includes(q) ||
          cap.description.toLowerCase().includes(q)
      );
      const groupMatches = group.title.toLowerCase().includes(q) || group.description.toLowerCase().includes(q);

      return {
        ...group,
        capabilities: groupMatches ? group.capabilities : matchedCaps,
      };
    }).filter((group) => group.capabilities.length > 0);
  }, [searchQuery, modules]);

  const totalCapabilitiesCount = useMemo(() => {
    return catalogMetadata.length;
  }, [catalogMetadata]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#FBF9F6] border border-gray-200 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans animate-in zoom-in-95 duration-200">
        {/* Modal Header Banner */}
        <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#5A1220]/10 text-[#5A1220] flex items-center justify-center border border-[#5A1220]/20 shadow-inner">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-gray-900 font-display tracking-tight">
                User Access Matrix
              </h2>
              <p className="text-xs text-gray-500">
                Matrix grid of module visibility and operational capabilities for academic scheduling.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Close matrix modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* User Scope & Focus Card */}
        <div className="px-6 py-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* User Details */}
            <div className="flex items-center gap-3.5">
              <ProfileAvatar
                src={user.profile_picture}
                alt={user.name}
                className="w-12 h-12 rounded-2xl border-2 border-gray-200 shadow-sm shrink-0"
                iconClassName="h-6 w-6"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-gray-900 truncate">{user.name}</h3>
                  <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                    @{user.username}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200">
                    {user.role}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {user.department ? `${user.department}` : 'No Department'} •{' '}
                  <span className="text-gray-400">{user.email}</span>
                </p>
              </div>
            </div>

            {/* Metrics Chips */}
            <div className="flex items-center gap-2 self-start lg:self-center flex-wrap">
              <div className="px-3 py-1.5 rounded-xl bg-gray-100/90 border border-gray-200 text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>
                  <strong>{effectivePermissions.length}</strong> / {totalCapabilitiesCount} Active
                </span>
              </div>

              <div
                className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs font-semibold text-amber-900 flex items-center gap-1.5"
                title="Role-inherited permissions cannot be modified directly"
              >
                <Lock size={13} className="text-amber-700" />
                <span>
                  <strong>{inheritedPermissions.length}</strong> Role Defaults
                </span>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                <Layers size={13} className="text-indigo-700" />
                <span>
                  <strong>{directPermissions.length}</strong> Direct Grants
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar: Presets + Live Search */}
        <div className="px-6 py-3.5 bg-gray-50/80 border-b border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 [scrollbar-width:none]">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1 shrink-0">
              Presets:
            </span>

            {Object.entries(presets).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
                  currentPresetKey === key
                    ? 'bg-[#5A1220] text-white border-[#5A1220] shadow-xs'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {preset.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => applyPreset('defaults')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
                currentPresetKey === 'defaults'
                  ? 'bg-gray-800 text-white border-gray-800 shadow-xs'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
              title="Clear all direct grants to rely exclusively on role inheritance"
            >
              Role Defaults
            </button>

            {currentPresetKey === 'custom' && (
              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-[#C9952A]/15 text-[#8f6412] border border-[#C9952A]/30">
                Custom Selection
              </span>
            )}
          </div>

          {/* Search Modules & Capabilities */}
          <div className="relative w-full sm:w-64">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search capabilities..."
              className="w-full pl-9 pr-8 py-1.5 rounded-xl border border-gray-200 bg-white text-xs outline-none focus:ring-2 focus:ring-[#5A1220]/20 focus:border-[#5A1220] text-gray-800 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Unsaved Changes Banner */}
        {hasUnsavedChanges && (
          <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-700 shrink-0" />
              <span>You have unsaved access changes. Click &quot;Save Changes&quot; to apply.</span>
            </div>
            <button
              type="button"
              onClick={handleResetToSaved}
              className="text-xs font-bold text-amber-800 underline hover:text-amber-950 cursor-pointer"
            >
              Discard changes
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2 shrink-0">
            <AlertCircle size={15} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Matrix Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 animate-pulse">
                  <Skeleton className="h-5 w-48 rounded" />
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredModules.length === 0 ? (
            <div className="py-16 text-center text-gray-400 border border-dashed border-gray-300 rounded-2xl bg-white">
              <Search size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-semibold text-gray-600">No capabilities match &quot;{searchQuery}&quot;</p>
              <p className="text-xs text-gray-400 mt-1">Try clearing your search query to see all modules.</p>
            </div>
          ) : (
            filteredModules.map((group) => {
              const GroupIcon = MODULE_ICONS[group.id] || Layers;

              return (
                <div
                  key={group.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden"
                >
                  {/* Module Header */}
                  <div className="px-5 py-3.5 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-[#5A1220] shadow-2xs">
                        <GroupIcon size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{group.title}</h4>
                        <p className="text-[11px] text-gray-500">{group.description}</p>
                      </div>
                    </div>

                    <span className="text-[11px] font-bold text-gray-400">
                      {group.capabilities.filter((c) => effectivePermissions.includes(c.id)).length} /{' '}
                      {group.capabilities.length} active
                    </span>
                  </div>

                  {/* Capability Rows */}
                  <div className="divide-y divide-gray-100">
                    {group.capabilities.map((capability) => {
                      const isInherited = inheritedPermissions.includes(capability.id);
                      const isDirect = directPermissions.includes(capability.id);
                      const isEffective = isInherited || isDirect;
                      const isAssignable = capability.assignable !== false;
                      // Held in place while something that needs it is still granted.
                      const requiredBy = isDirect ? dependentsOf(capability.id, directPermissions) : [];
                      const isRequired = requiredBy.length > 0;

                      return (
                        <div
                          key={capability.id}
                          className={`px-5 py-3.5 flex items-center justify-between gap-4 transition-colors ${
                            isEffective ? 'bg-amber-50/15' : 'hover:bg-gray-50/50'
                          }`}
                        >
                          {/* Capability Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-gray-900 leading-snug">
                                {capability.title}
                              </span>
                              <code className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200/60">
                                {capability.id}
                              </code>

                              {/* Source Badge */}
                              {isInherited ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-850 border border-amber-200">
                                  <Lock size={10} />
                                  Role Default
                                </span>
                              ) : isDirect ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-850 border border-emerald-200">
                                  <Check size={10} />
                                  Direct Grant
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11.5px] text-gray-500 mt-0.5 leading-relaxed">
                              {capability.description}
                            </p>
                          </div>

                          {/* Toggle Switch */}
                          <div className="shrink-0 flex items-center gap-2.5">
                            {isInherited && (
                              <div
                                className="text-gray-400 cursor-help"
                                title={`Inherited from ${user.role} role. Cannot be revoked directly.`}
                              >
                                <Info size={14} />
                              </div>
                            )}

                            <button
                              type="button"
                              role="switch"
                              aria-checked={isEffective}
                              disabled={isInherited || !isAssignable || isRequired || isSaving}
                              onClick={() => toggleDirectPermission(capability.id)}
                              className={`
                                relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
                                transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#5A1220]/20
                                ${
                                  isInherited
                                    ? 'bg-amber-600/70 cursor-not-allowed opacity-80'
                                    : !isAssignable
                                    ? 'bg-gray-100 cursor-not-allowed opacity-60'
                                    : isRequired
                                    ? 'bg-emerald-600/70 cursor-not-allowed opacity-80'
                                    : isDirect
                                    ? 'bg-emerald-600 cursor-pointer'
                                    : 'bg-gray-200 cursor-pointer hover:bg-gray-300'
                                }
                              `}
                              title={
                                isInherited
                                  ? `Inherited from ${user.role} role (locked)`
                                  : !isAssignable
                                  ? `Unavailable for the ${user.role} role`
                                  : isRequired
                                  ? `Required by ${requiredBy.join(', ')}. Revoke those first.`
                                  : isDirect
                                  ? 'Click to revoke direct grant'
                                  : 'Click to grant capability directly'
                              }
                            >
                              <span
                                aria-hidden="true"
                                className={`
                                  pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0
                                  transition duration-200 ease-in-out flex items-center justify-center
                                  ${isEffective ? 'translate-x-5' : 'translate-x-0'}
                                `}
                              >
                                {isInherited ? (
                                  <Lock size={10} className="text-amber-700" />
                                ) : isDirect ? (
                                  <Check size={11} className="text-emerald-700 font-bold" />
                                ) : null}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-gray-500">
            {hasUnsavedChanges ? (
              <span className="text-amber-700 font-semibold flex items-center gap-1.5">
                <AlertCircle size={14} />
                Unsaved adjustments will be committed to the database.
              </span>
            ) : (
              <span className="text-gray-400">All permissions currently synced with server.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {hasUnsavedChanges && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleResetToSaved}
                className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            )}

            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isSaving || !hasUnsavedChanges}
              onClick={handleSave}
              className="px-5 py-2 bg-[#5A1220] hover:bg-[#410b15] text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:scale-[1.01]"
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save Access Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
