import { CheckCircle2, Loader2, X } from "lucide-react";
import type { ScheduleRecommendation } from "./types";
import type { Subject, Room } from "../types";

const formatTime = (value: string): string => {
  const [hourValue, minuteValue] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return minute === 0 ? `${displayHour} ${suffix}` : `${displayHour}:${minuteValue} ${suffix}`;
};

interface RecommendationOptionCardProps {
  recommendation: ScheduleRecommendation;
  subjects: Subject[];
  rooms: Room[];
  isActing: boolean;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}

export default function RecommendationOptionCard({
  recommendation,
  subjects,
  rooms,
  isActing,
  onAccept,
  onReject
}: RecommendationOptionCardProps) {
  const meetingsByCourse = new Map<number, typeof recommendation.recommended_schedules>();
  recommendation.recommended_schedules.forEach((meeting) => {
    const existing = meetingsByCourse.get(meeting.course_id) ?? [];
    existing.push(meeting);
    meetingsByCourse.set(meeting.course_id, existing);
  });

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="bg-[#4e0a10] text-white text-xs font-extrabold px-2.5 py-1 rounded-full">
            Rank #{recommendation.rank}
          </span>
          <span className="text-[11px] font-bold text-slate-500">
            Score: {recommendation.score} <span className="font-normal">(lower is better)</span>
          </span>
        </div>
      </div>

      <div className="flex-1 divide-y divide-slate-100 max-h-64 overflow-y-auto">
        {Array.from(meetingsByCourse.entries()).map(([courseId, meetings]) => {
          const subject = subjects.find((s) => Number(s.id) === courseId);
          return (
            <div key={courseId} className="px-4 py-2.5">
              <p className="text-xs font-bold text-slate-800">
                {subject?.code ?? `Course #${courseId}`}
              </p>
              <p className="text-[11px] text-slate-500 mb-1">{subject?.name ?? ""}</p>
              {meetings.map((meeting, idx) => {
                const room = rooms.find((r) => Number(r.id) === meeting.room_id);
                return (
                  <p key={idx} className="text-[11px] text-slate-600">
                    {meeting.day} · {formatTime(meeting.start_time)}–{formatTime(meeting.end_time)} ·{" "}
                    {room?.name ?? `Room #${meeting.room_id}`}
                    {meeting.mode !== "on-site" && (
                      <span className="ml-1 uppercase text-[9px] font-bold text-slate-400">
                        ({meeting.mode})
                      </span>
                    )}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
        <button
          type="button"
          onClick={() => onReject(recommendation.id)}
          disabled={isActing}
          className="flex-1 flex items-center justify-center gap-1.5 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg py-2 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="w-3.5 h-3.5" />
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => onAccept(recommendation.id)}
          disabled={isActing}
          className="flex-1 flex items-center justify-center gap-1.5 bg-[#4e0a10] hover:brightness-110 text-white rounded-lg py-2 text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isActing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          {isActing ? "Saving..." : "Accept This Option"}
        </button>
      </div>
    </div>
  );
}
