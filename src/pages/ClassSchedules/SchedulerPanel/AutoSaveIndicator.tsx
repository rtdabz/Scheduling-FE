import { Cloud, CloudOff } from "lucide-react";
import LoadingSpinner from "../../../components/ui/LoadingSpinner";
import type { DraftSaveState } from "./hooks/useServerDraft";

/** Saving… / Saved / Save failed (with Retry) for auto-saved workflows. */
export default function AutoSaveIndicator({ state, loading, loadFailed, onRetry }: {
  state: DraftSaveState;
  loading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
}) {
  const view = loading
    ? { tone: "saving", icon: <LoadingSpinner className="h-3 w-3" />, text: "Restoring…" }
    : loadFailed
      ? { tone: "error", icon: <CloudOff className="h-3.5 w-3.5" />, text: "Couldn't load saved progress" }
      : state === "saving"
        ? { tone: "saving", icon: <LoadingSpinner className="h-3 w-3" />, text: "Saving…" }
        : state === "error"
          ? { tone: "error", icon: <CloudOff className="h-3.5 w-3.5" />, text: "Save failed" }
          : state === "saved"
            ? { tone: "saved", icon: <Cloud className="h-3.5 w-3.5" />, text: "Saved" }
            : null;

  return (
    <span role="status" aria-live="polite" className="workflow-autosave" data-tone={view?.tone}>
      {view && <>{view.icon}<span>{view.text}</span></>}
      {view?.tone === "error" && (
        <button type="button" onClick={onRetry} className="workflow-autosave-retry">Retry</button>
      )}
    </span>
  );
}
