import { lazy, Suspense, useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive as ArchiveIcon, LayoutList } from 'lucide-react';
import { getStoredUserRole } from '../../../lib/storedUser';
import { useModuleArchiveCount } from './useModuleArchiveCount';
import { ARCHIVE_PARAM_PREFIX, ARCHIVED_VIEW_PARAM, type ArchiveModule } from './archiveTypes';

// The archive list loads only when the Archived tab opens.
const ArchivePanel = lazy(() => import('./ArchivePanel'));
const panelFallback = <p role="status" className="rounded-2xl border border-gray-200 bg-white p-4 text-xs font-semibold text-gray-600">Loading archived records…</p>;

interface ModuleArchiveTabsProps {
  module: ArchiveModule;
  /** Label of the module's live records tab. */
  activeLabel: string;
  children: ReactNode;
  /** Render the panel without tabs (a page dedicated to the module archive). */
  archiveOnly?: boolean;
}

/**
 * Active / Archived tabs for a module. The Archived tab is shown only to the VPAA, who holds the
 * existing archive authority; other roles sharing the module see only its live records.
 */
export default function ModuleArchiveTabs({ module, activeLabel, children, archiveOnly = false }: ModuleArchiveTabsProps) {
  const isVpaa = getStoredUserRole() === 'vpaa';
  const [searchParams, setSearchParams] = useSearchParams();
  const showArchived = isVpaa && (archiveOnly || searchParams.get(ARCHIVED_VIEW_PARAM) === '1');
  const { count, reload } = useModuleArchiveCount(module, isVpaa);

  const select = useCallback((archived: boolean) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (archived) next.set(ARCHIVED_VIEW_PARAM, '1');
      else next.delete(ARCHIVED_VIEW_PARAM);
      // Archive filters belong to the archived view only.
      [...next.keys()].filter((key) => key.startsWith(ARCHIVE_PARAM_PREFIX)).forEach((key) => next.delete(key));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  if (!isVpaa) return <>{children}</>;
  if (archiveOnly) return <Suspense fallback={panelFallback}><ArchivePanel module={module} onRestored={() => void reload()} /></Suspense>;

  const tabClass = (active: boolean) => `selection-indicator inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220] ${
    active ? 'shadow-sm' : 'text-gray-600 hover:bg-gray-100'
  }`;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={`${activeLabel} views`} className="inline-flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        <button type="button" role="tab" aria-selected={!showArchived} onClick={() => select(false)} className={tabClass(!showArchived)}>
          <LayoutList size={14} aria-hidden="true" /> {activeLabel}
        </button>
        <button type="button" role="tab" aria-selected={showArchived} onClick={() => select(true)} className={tabClass(showArchived)}>
          <ArchiveIcon size={14} aria-hidden="true" /> Archived{count !== null && <>{' ('}<span className="selection-indicator-count">{count}</span>)</>}
        </button>
      </div>
      {showArchived ? <Suspense fallback={panelFallback}><ArchivePanel module={module} onRestored={() => void reload()} /></Suspense> : children}
    </div>
  );
}
