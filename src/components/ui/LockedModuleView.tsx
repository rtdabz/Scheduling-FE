import { Lock, ArrowLeft, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStoredUser } from '../../lib/storedUser';

interface LockedModuleViewProps {
  moduleName?: string;
  requiredCapability?: string | string[];
}

export default function LockedModuleView({ moduleName = 'This Module', requiredCapability }: LockedModuleViewProps) {
  const navigate = useNavigate();
  const user = getStoredUser();
  const role = user?.role?.toLowerCase() || '';

  const getDashboardPath = () => {
    if (role === 'dean') return '/dean/dashboard';
    if (role === 'secretary') return '/secretary/dashboard';
    if (role === 'program_head') return '/program_head/dashboard';
    return '/dashboard';
  };

  const capabilities = Array.isArray(requiredCapability)
    ? requiredCapability.join(', ')
    : requiredCapability;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl border border-gray-200 shadow-xl p-8 flex flex-col items-center relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-100/60 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-red-100/40 rounded-full blur-2xl pointer-events-none" />

        {/* Lock Icon */}
        <div className="w-16 h-16 rounded-2xl bg-[#5A1220]/10 text-[#5A1220] flex items-center justify-center mb-5 border border-[#5A1220]/20 shadow-inner">
          <Lock size={32} className="text-[#5A1220]" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200 mb-3">
          <ShieldAlert size={13} />
          Access Restricted
        </span>

        <h2 className="text-xl font-extrabold text-gray-900 font-display mb-2">
          {moduleName} is Locked
        </h2>

        <p className="text-sm text-gray-600 leading-relaxed mb-4 max-w-sm">
          Access restricted. Ask an administrator to grant access to this module.
          {capabilities && (
            <span className="block mt-2 font-mono text-xs text-gray-500 bg-gray-100 py-1 px-2.5 rounded-lg border border-gray-200/80 inline-block">
              Required: {capabilities}
            </span>
          )}
        </p>

        <p className="text-xs text-gray-400 mb-6">
          To request access, please coordinate with the Vice President for Academic Affairs (VPAA) office.
        </p>

        <button
          type="button"
          onClick={() => navigate(getDashboardPath())}
          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-[#5A1220] hover:bg-[#410b15] text-white text-sm font-bold rounded-xl shadow-md transition-all cursor-pointer hover:scale-[1.01]"
        >
          <ArrowLeft size={16} />
          <span>Return to Dashboard</span>
        </button>
      </div>
    </div>
  );
}
