import { useEffect } from "react";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import RecommendationOptionCard from "./RecommendationOptionCard";
import type { Subject, Room } from "../types";
import type { ScheduleRecommendation } from "./types";

interface GenerateScheduleModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  isActingOnId: number | null;
  recommendations: ScheduleRecommendation[];
  errorMessage: string | null;
  sectionId: string;
  sectionName: string;
  subjects: Subject[];
  rooms: Room[];
  onClose: () => void;
  onGenerate: (sectionId: string, courseIds?: number[]) => void;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}

export default function GenerateScheduleModal({
  isOpen,
  isGenerating,
  isActingOnId,
  recommendations,
  errorMessage,
  sectionId,
  sectionName,
  subjects,
  rooms,
  onClose,
  onGenerate,
  onAccept,
  onReject
}: GenerateScheduleModalProps) {
  useEffect(() => {
    if (isOpen && sectionId) {
      const courseIds = subjects.map((s) => Number(s.id)).filter((id) => id > 0);
      onGenerate(sectionId, courseIds.length > 0 ? courseIds : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sectionId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#4e0a10] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-gray-800 leading-tight">Generate Schedule</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Ranked, conflict-free options for <span className="font-semibold">{sectionName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="w-8 h-8 text-[#4e0a10] animate-spin mb-3" />
              <p className="text-sm font-semibold text-slate-700">Solving for the best schedule options...</p>
              <p className="text-xs text-slate-400 mt-1">This checks every room, faculty, and time conflict.</p>
            </div>
          )}

          {!isGenerating && errorMessage && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
              <p className="text-sm font-semibold text-slate-700">{errorMessage}</p>
            </div>
          )}

          {!isGenerating && !errorMessage && recommendations.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map((rec) => (
                <RecommendationOptionCard
                  key={rec.id}
                  recommendation={rec}
                  subjects={subjects}
                  rooms={rooms}
                  isActing={isActingOnId === rec.id}
                  onAccept={onAccept}
                  onReject={onReject}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
