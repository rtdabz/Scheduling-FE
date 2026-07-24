import React from 'react';

interface YearLevelTabsProps {
  selectedYear: number;
  yearLevelStats: Record<number, { courses: number; units: number; lec: number; lab: number }>;
  onSelectYear: (year: number) => void;
}

const yearLabels: Record<number, string> = {
  1: '1st Year',
  2: '2nd Year',
  3: '3rd Year',
  4: '4th Year',
};

export default function YearLevelTabs({
  selectedYear,
  yearLevelStats,
  onSelectYear,
}: YearLevelTabsProps) {
  return (
    <div className="bg-white rounded-2xl p-2 border border-gray-200/80 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Horizontal Tab Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-gray-50/80 rounded-xl border border-gray-100">
        {[1, 2, 3, 4].map((year) => {
          const isSelected = selectedYear === year;
          const stats = yearLevelStats[year] || { courses: 0, units: 0, lec: 0, lab: 0 };

          return (
            <button
              key={year}
              type="button"
              onClick={() => onSelectYear(year)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-[#4e0a10] text-white shadow-sm border border-[#4e0a10]'
                  : 'bg-white text-gray-700 hover:text-[#4e0a10] hover:bg-gray-100/70 border border-gray-200/60'
              }`}
            >
              <span>{yearLabels[year]}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                  isSelected ? 'bg-[#C9952A] text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {stats.units}u
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Year Summary Info */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 font-semibold shrink-0">
        <span>Year {selectedYear} Total:</span>
        <span className="bg-[#4e0a10]/10 text-[#4e0a10] font-bold px-2.5 py-0.5 rounded-full">
          {yearLevelStats[selectedYear]?.courses || 0} Courses
        </span>
        <span className="bg-[#C9952A]/10 text-[#C9952A] font-bold px-2.5 py-0.5 rounded-full">
          {yearLevelStats[selectedYear]?.units || 0} Units
        </span>
      </div>
    </div>
  );
}
