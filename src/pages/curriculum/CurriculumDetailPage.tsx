import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Skeleton from '../../components/ui/Skeleton';
import { BookOpen } from 'lucide-react';

import CurriculumHeader from '../../components/curriculum/CurriculumHeader';
import SemesterCard from '../../components/curriculum/SemesterCard';
import SourceNotes from '../../components/curriculum/SourceNotes';
import { useCurriculumDetail } from '../../hooks/curriculum/useCurriculumDetail';
import { canAuthorCurriculum } from '../../lib/curriculumAccess';
import { notesForTerm, noteScopeLabel } from '../../lib/curriculumImport/notes';
import { getStoredUserRole } from '../../lib/storedUser';

export default function CurriculumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedSemester, setSelectedSemester] = useState(1);

  const userRole = getStoredUserRole() || 'user';

  const {
    curriculum,
    isLoading,
    isActivating,
    programs,
    selectedYear,
    setSelectedYear,
    removingCourseId,
    setRemovingCourseId,
    isRemoving,
    highlightedCourseId,
    yearLevelStats,
    currentYearSemesters,
    handleActivate,
    handleAddCourseToSemester,
    handleEditCourse,
    handleRemoveCourse,
    handleCourseHoursSaved,
  } = useCurriculumDetail(id);

  const canEditCourses = canAuthorCurriculum(curriculum) && searchParams.get('mode') === 'edit';

  const selectedCurriculumSemester = currentYearSemesters.find((semester) => semester.semester === selectedSemester) ?? currentYearSemesters[0];
  const notes = curriculum?.notes ?? [];
  const termCourses = selectedCurriculumSemester?.courses ?? [];
  const termNotes = selectedCurriculumSemester
    ? notesForTerm(notes, selectedYear, selectedCurriculumSemester.semester, new Set(termCourses.map((course) => course.id)))
    : [];

  return (
    <div className="w-full">
      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-4 w-40" />
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
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
          <CurriculumHeader
            curriculum={curriculum}
            isActivating={isActivating}
            canActivate={canEditCourses}
            onBack={() => navigate(userRole === 'vpaa' ? '/curriculum' : `/${userRole}/curriculum`)}
            onActivate={handleActivate}
          />

          <SourceNotes className="mb-4" notes={notes.filter((note) => note.scope.level === 'curriculum')} />
          <SourceNotes
            className="mb-4"
            title="Notes for this term, from the curriculum document"
            notes={termNotes.map((note) => ({
              ...note,
              label: noteScopeLabel(note.scope, termCourses.find((course) => course.id === (note.scope as { course_id?: number }).course_id)?.code),
            }))}
          />
          {selectedCurriculumSemester && (
            <SemesterCard
              semester={selectedCurriculumSemester}
              curriculumSemesters={currentYearSemesters}
              selectedYear={selectedYear}
              selectedSemester={selectedSemester}
              yearLevelStats={yearLevelStats}
              onSelectYear={(year) => {
                setSelectedYear(year);
                setSelectedSemester(1);
              }}
              onSelectSemester={setSelectedSemester}
              highlightedCourseId={highlightedCourseId}
              removingCourseId={removingCourseId}
              isRemoving={isRemoving}
              canEdit={canEditCourses}
              programs={programs}
              onInitiateRemove={(cId) => setRemovingCourseId(cId)}
              onCancelRemove={() => setRemovingCourseId(null)}
              onConfirmRemove={handleRemoveCourse}
              onAddCourseToSemester={handleAddCourseToSemester}
              onEditCourse={handleEditCourse}
              curriculumId={curriculum.id}
              hoursDefaults={curriculum.hours_defaults}
              onCourseHoursSaved={handleCourseHoursSaved}
            />
          )}
        </>
      )}
    </div>
  );
}
