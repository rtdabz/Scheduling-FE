import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Skeleton from '../../components/ui/Skeleton';
import { BookOpen } from 'lucide-react';

import CurriculumHeader from '../../components/curriculum/CurriculumHeader';
import YearLevelTabs from '../../components/curriculum/YearLevelTabs';
import SemesterCard from '../../components/curriculum/SemesterCard';
import { useCurriculumDetail } from '../../hooks/curriculum/useCurriculumDetail';

export default function CurriculumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userRole = user?.role?.toLowerCase() || 'user';
  const canManageCurriculum = ['vpaa', 'dean', 'secretary', 'program_head'].includes(userRole);

  const {
    curriculum,
    isLoading,
    isActivating,
    availableCourses,
    selectedYear,
    setSelectedYear,
    removingCourseId,
    setRemovingCourseId,
    isRemoving,
    highlightedCourseId,
    overallStats,
    yearLevelStats,
    currentYearSemesters,
    handleActivate,
    handleAddCourseToSemester,
    handleEditCourse,
    handleRemoveCourse,
  } = useCurriculumDetail(id);

  return (
    <div className="w-full">
      {isLoading ? (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-[#F7F4F0] border border-gray-100 shadow-sm p-6">
            <Skeleton className="h-8 w-64 mb-3" />
            <Skeleton className="h-5 w-40 mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : !curriculum ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
          <BookOpen size={44} className="mx-auto text-gray-300 mb-3" />
          <p className="text-lg font-bold text-gray-700 mb-1">Curriculum not found</p>
          <p className="text-xs text-gray-500">The curriculum you are looking for does not exist or has been removed.</p>
        </div>
      ) : (
        <>
          {/* Header Component */}
          <CurriculumHeader
            curriculum={curriculum}
            overallStats={overallStats}
            isActivating={isActivating}
            canActivate={canManageCurriculum}
            onBack={() => navigate('/secretary/curricula')}
            onActivate={handleActivate}
          />

          {/* Horizontal Year Level Navigation Tabs */}
          <YearLevelTabs
            selectedYear={selectedYear}
            yearLevelStats={yearLevelStats}
            onSelectYear={setSelectedYear}
          />

          {/* Two-Column Left and Right Semester Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {currentYearSemesters.map((term) => (
              <SemesterCard
                key={`${term.year_level}-${term.semester}`}
                term={term}
                availableCourses={availableCourses}
                highlightedCourseId={highlightedCourseId}
                removingCourseId={removingCourseId}
                isRemoving={isRemoving}
                canEdit={canManageCurriculum}
                onInitiateRemove={(cId) => setRemovingCourseId(cId)}
                onCancelRemove={() => setRemovingCourseId(null)}
                onConfirmRemove={handleRemoveCourse}
                onAddCourseToSemester={handleAddCourseToSemester}
                onEditCourse={handleEditCourse}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
