import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Cpu, Layers, Loader2, Sparkles, X } from "lucide-react";
import type { ProgressStep } from "./useGenerateSchedule";

interface GenerateScheduleModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  progressStep: ProgressStep;
  errorMessage: string | null;
  sectionId: string;
  sectionName: string;
  onClose: () => void;
  onGenerate: (sectionId: string, courseIds?: number[]) => void;
}

export default function GenerateScheduleModal({
  isOpen,
  isGenerating,
  progressStep,
  errorMessage,
  sectionId,
  sectionName,
  onClose,
  onGenerate,
}: GenerateScheduleModalProps) {
  useEffect(() => {
    if (isOpen && sectionId) {
      onGenerate(sectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sectionId]);

  if (!isOpen) return null;

  const getStepStatus = (step: "generating" | "constraints" | "finalizing") => {
    if (progressStep === "complete") return "completed";
    if (progressStep === "error") return "idle";

    const order = ["generating", "constraints", "finalizing"];
    const currentIndex = order.indexOf(progressStep);
    const stepIndex = order.indexOf(step);

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "current";
    return "idle";
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isGenerating) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
        <div className="bg-gradient-to-r from-[#4e0a10] to-[#7a121c] p-5 text-white flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md">
              <Sparkles className="w-5 h-5 text-[#C9952A] animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">Auto-Generating Schedule</h3>
              <p className="text-xs text-amber-200/80 mt-0.5 font-medium">
                Section: <span className="font-semibold text-white">{sectionName}</span>
              </p>
            </div>
          </div>
          {!isGenerating && (
            <button
              type="button"
              onClick={onClose}
              className="text-white/70 hover:text-white hover:bg-white/10 rounded-full p-1 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-6">
          {errorMessage ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="p-3 bg-red-50 text-red-600 rounded-full mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-gray-800">Generation Unsuccessful</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">{errorMessage}</p>
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => onGenerate(sectionId)}
                  className="px-4 py-2 bg-[#4e0a10] text-white text-xs font-bold rounded-lg hover:bg-[#6b0e17] transition-colors cursor-pointer"
                >
                  Retry Generation
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl transition-all duration-300 border border-gray-100 bg-gray-50/50">
                <div className="shrink-0">
                  {getStepStatus("generating") === "completed" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : getStepStatus("generating") === "current" ? (
                    <Loader2 className="w-5 h-5 text-[#4e0a10] animate-spin" />
                  ) : (
                    <Cpu className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div>
                  <p className={`text-xs font-bold ${getStepStatus("generating") === "current" ? "text-[#4e0a10]" : "text-gray-700"}`}>
                    Generating Schedule...
                  </p>
                  <p className="text-[11px] text-gray-400">Running Rule Engine & CSP Solver</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl transition-all duration-300 border border-gray-100 bg-gray-50/50">
                <div className="shrink-0">
                  {getStepStatus("constraints") === "completed" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : getStepStatus("constraints") === "current" ? (
                    <Loader2 className="w-5 h-5 text-[#4e0a10] animate-spin" />
                  ) : (
                    <Layers className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div>
                  <p className={`text-xs font-bold ${getStepStatus("constraints") === "current" ? "text-[#4e0a10]" : "text-gray-700"}`}>
                    Applying Constraints...
                  </p>
                  <p className="text-[11px] text-gray-400">Verifying rooms, faculty & time limits</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl transition-all duration-300 border border-gray-100 bg-gray-50/50">
                <div className="shrink-0">
                  {progressStep === "complete" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : getStepStatus("finalizing") === "current" ? (
                    <Loader2 className="w-5 h-5 text-[#4e0a10] animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div>
                  <p className={`text-xs font-bold ${progressStep === "complete" || getStepStatus("finalizing") === "current" ? "text-[#4e0a10]" : "text-gray-700"}`}>
                    {progressStep === "complete" ? "Schedule Plotted!" : "Finalizing Schedule..."}
                  </p>
                  <p className="text-[11px] text-gray-400">Placing entries into Timetable Grid</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden mt-2">
                <div
                  className="bg-gradient-to-r from-[#4e0a10] to-[#C9952A] h-full transition-all duration-300"
                  style={{
                    width:
                      progressStep === "generating"
                        ? "33%"
                        : progressStep === "constraints"
                        ? "66%"
                        : progressStep === "finalizing"
                        ? "90%"
                        : progressStep === "complete"
                        ? "100%"
                        : "0%",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
