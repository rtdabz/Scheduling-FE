import React, { useState } from "react";
import {
  Calendar,
  Search,
  Check,
  Trash2,
  X,
  BookOpen,
  Info
} from "lucide-react";

// Subject interface
export interface Subject {
  id: string;
  code: string;
  name: string;
  units: number;
  category: "GEC" | "Major" | "Minor" | "PE/NSTP";
}

// Mock Data for academic subjects
const MOCK_SUBJECTS: Subject[] = [
  // GEC
  { id: "ge-101", code: "GE 101", name: "Understanding the Self", units: 3, category: "GEC" },
  { id: "ge-102", code: "GE 102", name: "Readings in Philippine History", units: 3, category: "GEC" },
  { id: "ge-103", code: "GE 103", name: "The Contemporary World", units: 3, category: "GEC" },
  { id: "ge-104", code: "GE 104", name: "Mathematics in the Modern World", units: 3, category: "GEC" },
  
  // Major
  { id: "cs-401", code: "CS 401", name: "Intelligent Systems", units: 3, category: "Major" },
  { id: "cs-402", code: "CS 402", name: "Software Engineering", units: 3, category: "Major" },
  { id: "cs-403", code: "CS 403", name: "Network Security", units: 3, category: "Major" },
  { id: "cs-404", code: "CS 404", name: "Data Science & Analytics", units: 3, category: "Major" },
  
  // Minor
  { id: "it-301", code: "IT 301", name: "Database Administration", units: 3, category: "Minor" },
  { id: "it-302", code: "IT 302", name: "Human Computer Interaction", units: 3, category: "Minor" },
  
  // PE/NSTP
  { id: "pe-101", code: "PATHFIT 1", name: "Movement Competency Training", units: 2, category: "PE/NSTP" },
  { id: "nstp-101", code: "NSTP 1", name: "National Service Training Program 1", units: 3, category: "PE/NSTP" }
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_SLOTS = [
  "7:00 AM - 8:00 AM",
  "8:00 AM - 9:00 AM",
  "9:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "12:00 PM - 1:00 PM",
  "1:00 PM - 2:00 PM",
  "2:00 PM - 3:00 PM",
  "3:00 PM - 4:00 PM",
  "4:00 PM - 5:00 PM",
  "5:00 PM - 6:00 PM",
  "6:00 PM - 7:00 PM"
];

// Helper to get category-specific tailwind classes
const getCategoryStyles = (category: Subject["category"]) => {
  switch (category) {
    case "GEC":
      return {
        bg: "bg-purple-50",
        text: "text-purple-800",
        border: "border-purple-500",
        badge: "bg-purple-100 text-purple-800 border-purple-200"
      };
    case "Major":
      return {
        bg: "bg-blue-50",
        text: "text-blue-800",
        border: "border-blue-500",
        badge: "bg-blue-100 text-blue-800 border-blue-200"
      };
    case "Minor":
      return {
        bg: "bg-emerald-50",
        text: "text-emerald-800",
        border: "border-emerald-500",
        badge: "bg-emerald-100 text-emerald-800 border-emerald-200"
      };
    case "PE/NSTP":
      return {
        bg: "bg-amber-50",
        text: "text-amber-800",
        border: "border-amber-500",
        badge: "bg-amber-100 text-amber-800 border-amber-200"
      };
  }
};

export default function SchedulerPanel() {
  // Required states
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [dragSubjectId, setDragSubjectId] = useState<string | null>(null);
  const [dragFromCell, setDragFromCell] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // UI state for drop feedback
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Filter subjects based on query
  const filteredSubjects = MOCK_SUBJECTS.filter((subject) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      subject.code.toLowerCase().includes(term) ||
      subject.name.toLowerCase().includes(term)
    );
  });

  // Calculate statistics
  const totalSubjects = MOCK_SUBJECTS.length;
  const placedSubjectIds = new Set(Object.values(placed));
  const totalPlaced = placedSubjectIds.size;

  // HTML5 Drag and Drop handlers
  const handleDragStartFromBank = (e: React.DragEvent, subjectId: string) => {
    setDragSubjectId(subjectId);
    setDragFromCell(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", subjectId);
  };

  const handleDragStartFromCell = (
    e: React.DragEvent,
    cellKey: string,
    subjectId: string
  ) => {
    setDragSubjectId(subjectId);
    setDragFromCell(cellKey);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", subjectId);
  };

  const handleDragEnd = () => {
    setDragSubjectId(null);
    setDragFromCell(null);
    setHoveredCell(null);
  };

  const handleDragOver = (e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    const cellKey = `${dayIndex}-${timeIndex}`;
    if (hoveredCell !== cellKey) {
      setHoveredCell(cellKey);
    }
  };

  const handleDragLeave = () => {
    setHoveredCell(null);
  };

  const handleDrop = (e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    setHoveredCell(null);

    const subjectId = e.dataTransfer.getData("text/plain") || dragSubjectId;
    if (!subjectId) return;

    const targetCellKey = `${dayIndex}-${timeIndex}`;

    setPlaced((prev) => {
      const next = { ...prev };

      // If we are dragging from another cell, delete from original position
      if (dragFromCell) {
        delete next[dragFromCell];
      } else {
        // If it's a new placement from the bank, make sure any existing placement of the same subject is cleared
        Object.keys(next).forEach((key) => {
          if (next[key] === subjectId) {
            delete next[key];
          }
        });
      }

      // Assign to the new position
      next[targetCellKey] = subjectId;
      return next;
    });

    setDragSubjectId(null);
    setDragFromCell(null);
  };

  const handleRemoveSubject = (cellKey: string) => {
    setPlaced((prev) => {
      const next = { ...prev };
      delete next[cellKey];
      return next;
    });
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear the entire schedule?")) {
      setPlaced({});
    }
  };

  const categories: Array<Subject["category"]> = ["GEC", "Major", "Minor", "PE/NSTP"];

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full text-slate-800 antialiased h-[calc(100vh-180px)] min-h-[500px]">
      {/* ================= LEFT PANEL: Subject Bank ================= */}
      <div className="w-full lg:w-56 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            Subject bank
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-none">
            Drag to place on grid
          </p>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
            />
          </div>
        </div>

        {/* Categories / Subject List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {categories.map((category) => {
            const list = filteredSubjects.filter((s) => s.category === category);
            if (list.length === 0) return null;

            return (
              <div key={category} className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {category}
                  </span>
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold">
                    {list.length}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {list.map((subject) => {
                    const isPlaced = placedSubjectIds.has(subject.id);
                    const styles = getCategoryStyles(subject.category);

                    return (
                      <div
                        key={subject.id}
                        draggable={!isPlaced}
                        onDragStart={(e) => handleDragStartFromBank(e, subject.id)}
                        onDragEnd={handleDragEnd}
                        className={`group border rounded-xl p-2.5 transition-all duration-200 select-none ${
                          isPlaced
                            ? "bg-slate-50/80 border-slate-200/80 opacity-50 cursor-not-allowed"
                            : `cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 ${styles.bg} ${styles.border} ${styles.text}`
                        }`}
                      >
                        <div className="flex justify-between items-start gap-1">
                          <span className="font-extrabold text-[11px] uppercase tracking-wide truncate">
                            {subject.code}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isPlaced && (
                              <span className="flex items-center justify-center bg-emerald-100 text-emerald-800 border border-emerald-200 rounded px-1 text-[8px] font-bold">
                                <Check className="w-2.5 h-2.5 mr-0.5 stroke-[3]" />
                                Placed
                              </span>
                            )}
                            <span
                              className={`text-[9px] px-1 rounded font-bold border shrink-0 ${
                                isPlaced
                                  ? "bg-slate-200 text-slate-600 border-slate-300"
                                  : styles.badge
                              }`}
                            >
                              {subject.units}u
                            </span>
                          </div>
                        </div>
                        <div className="text-[10px] font-semibold leading-tight mt-1 truncate">
                          {subject.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredSubjects.length === 0 && (
            <div className="text-center py-6 text-slate-400 text-xs">
              No subjects found
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs font-semibold text-slate-500 select-none">
          <span>Total Placed</span>
          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
            {totalPlaced} of {totalSubjects} placed
          </span>
        </div>
      </div>

      {/* ================= RIGHT PANEL: Weekly Grid ================= */}
      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/30">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              <Calendar className="w-4.5 h-4.5 text-indigo-600" />
              Weekly schedule
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 font-semibold">
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                Section: BSCS 4A
              </span>
              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                1st Semester, AY 2026-2027
              </span>
            </div>
          </div>

          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-xl text-xs font-semibold transition-all duration-150 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear all
          </button>
        </div>

        {/* Grid Area with Custom Scrollbars */}
        <div className="flex-1 overflow-auto bg-slate-50/20 p-4">
          <div className="min-w-[800px] border-t border-l border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white grid grid-cols-7">
            {/* Header row */}
            <div className="bg-slate-50/80 border-r border-b border-slate-200 p-3 font-bold text-[11px] text-slate-500 text-center uppercase tracking-wider select-none flex items-center justify-center">
              Time
            </div>
            {DAYS.map((day) => (
              <div
                key={day}
                className="bg-slate-50/80 border-r border-b border-slate-200 p-3 font-bold text-xs text-slate-700 text-center uppercase tracking-wider select-none"
              >
                {day}
              </div>
            ))}

            {/* Time Slots */}
            {TIME_SLOTS.map((slot, timeIndex) => {
              const [startTime, endTime] = slot.split(" - ");

              return (
                <React.Fragment key={timeIndex}>
                  {/* Time label cell */}
                  <div className="bg-slate-50/30 border-r border-b border-slate-200 p-2 text-[10px] font-semibold text-slate-500 flex flex-col justify-center items-center h-20 select-none shrink-0">
                    <span className="font-extrabold text-slate-700 text-xs">
                      {startTime}
                    </span>
                    <span className="text-[9px] text-slate-400 mt-0.5">
                      to {endTime}
                    </span>
                  </div>

                  {/* Day grid cells */}
                  {DAYS.map((_, dayIndex) => {
                    const cellKey = `${dayIndex}-${timeIndex}`;
                    const placedSubjectId = placed[cellKey];
                    const subject = placedSubjectId
                      ? MOCK_SUBJECTS.find((s) => s.id === placedSubjectId)
                      : null;
                    const isHovered = hoveredCell === cellKey;
                    const isDraggingThis =
                      dragSubjectId &&
                      dragFromCell === cellKey &&
                      dragSubjectId === placedSubjectId;

                    return (
                      <div
                        key={dayIndex}
                        onDragOver={(e) => handleDragOver(e, dayIndex, timeIndex)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, dayIndex, timeIndex)}
                        className={`border-r border-b border-slate-200 p-1 min-h-[80px] h-20 transition-all duration-150 relative flex items-center justify-center ${
                          isHovered
                            ? "bg-slate-100 ring-2 ring-indigo-500/20 ring-inset"
                            : "bg-white hover:bg-slate-50/30"
                        }`}
                      >
                        {subject ? (
                          <div
                            draggable
                            onDragStart={(e) =>
                              handleDragStartFromCell(e, cellKey, subject.id)
                            }
                            onDragEnd={handleDragEnd}
                            className={`h-full w-full rounded-xl border p-2 flex flex-col justify-between relative cursor-grab active:cursor-grabbing group shadow-sm hover:shadow transition-all duration-200 ${
                              isDraggingThis ? "opacity-30" : "opacity-100"
                            } ${getCategoryStyles(subject.category).bg} ${
                              getCategoryStyles(subject.category).border} ${
                              getCategoryStyles(subject.category).text
                            }`}
                          >
                            {/* Remove button */}
                            <button
                              onClick={() => handleRemoveSubject(cellKey)}
                              className="absolute -top-1.5 -right-1.5 bg-white border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-semibold shadow transition-all duration-150 opacity-0 group-hover:opacity-100 z-10"
                              title="Remove Subject"
                            >
                              <X className="w-3 h-3" />
                            </button>

                            <div className="flex flex-col h-full justify-between">
                              <div>
                                <div className="flex justify-between items-start gap-1">
                                  <span className="font-extrabold text-[10px] uppercase tracking-wide truncate">
                                    {subject.code}
                                  </span>
                                  <span
                                    className={`text-[8px] px-1 rounded font-bold border shrink-0 ${
                                      getCategoryStyles(subject.category).badge
                                    }`}
                                  >
                                    {subject.units}u
                                  </span>
                                </div>
                                <div className="text-[9px] font-semibold leading-tight mt-0.5 line-clamp-2 break-words">
                                  {subject.name}
                                </div>
                              </div>

                              <div className="text-[8px] font-bold uppercase tracking-wider opacity-60 mt-0.5">
                                {subject.category}
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Visual slot guidance
                          <div className="h-full w-full rounded-xl border border-dashed border-slate-100 flex items-center justify-center text-[10px] text-slate-300 font-medium select-none pointer-events-none">
                            {isHovered ? "Drop Here" : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            Categories:
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-purple-50 border border-purple-500"></span>
            GEC
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-500"></span>
            Major
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-emerald-50 border border-emerald-500"></span>
            Minor
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-500"></span>
            PE/NSTP
          </span>
        </div>
      </div>
    </div>
  );
}
