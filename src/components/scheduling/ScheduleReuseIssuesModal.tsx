import Modal from '../ui/Modal';
import { ModalButton } from '../ui/ModalForm';

export type ReuseIssue = {
  check: string;
  message: string;
  code?: string;
  section_name?: string;
  course_code?: string;
};

const CATEGORIES: Record<string, { label: string; guidance: string }> = {
  already_scheduled: {
    label: 'Already scheduled',
    guidance: 'Remove or reset the existing draft classes in Schedule Builder, then reuse this schedule.',
  },
  department: { label: 'Department', guidance: 'Check that the department is active and available to your account.' },
  semester: { label: 'Semester', guidance: 'Check the active semester and the semester of the saved schedule.' },
  sections: { label: 'Sections', guidance: 'Review the listed sections in the active semester.' },
  curriculum: { label: 'Curriculum', guidance: 'Check that each listed course is available in the section’s active curriculum.' },
  facilities: { label: 'Rooms and facilities', guidance: 'Review the listed rooms and their availability.' },
  instructors: { label: 'Instructors', guidance: 'Review the instructor requirements listed below.' },
  conflicts: { label: 'Schedule conflicts', guidance: 'Review the affected classes and their times in Schedule Builder.' },
  scheduling_rules: { label: 'Scheduling rules', guidance: 'Review the class requirements listed below.' },
  snapshot: { label: 'Saved schedule details', guidance: 'Check the saved details below. A newer history entry may have the information needed to reuse this schedule.' },
  schedule: { label: 'Schedule', guidance: 'Review the schedule details listed below.' },
};

function describeIssue(issue: ReuseIssue, index: number) {
  // Older API responses have no grouping fields; recognize only the known duplicate message.
  const legacy = /^Section (.+?) already has (.+?) scheduled in the active semester\./.exec(issue.message);
  const alreadyScheduled = issue.code === 'already_scheduled' || legacy !== null;
  return {
    ...issue,
    index,
    category: alreadyScheduled ? 'already_scheduled' : issue.check,
    section: alreadyScheduled ? issue.section_name || legacy?.[1] : undefined,
    course: alreadyScheduled ? issue.course_code || legacy?.[2] : undefined,
  };
}

export default function ScheduleReuseIssuesModal({
  issues, scheduleLabel, period, onClose, returnFocusTo,
}: {
  issues: ReuseIssue[];
  scheduleLabel: string;
  period: string;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const described = issues.map(describeIssue);
  const categories = Array.from(new Set(described.map((issue) => issue.category))).map((key) => ({
    key,
    ...(CATEGORIES[key] ?? { label: key.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) || 'Other issues', guidance: 'Review the details listed below.' }),
  }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      title="Schedule not reused"
      description={`${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} to review. No classes were added.`}
      size="xl"
      className="shadow-2xl"
      bodyClassName="px-4 py-5 sm:px-6 sm:py-6"
      footer={(
        <>
          <p className="mr-auto max-w-2xl text-xs leading-5 text-slate-500">Correct the issues above, then try Reuse Schedule again.</p>
          <ModalButton variant="primary" onClick={onClose}>Close</ModalButton>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved schedule</p>
          <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <p className="min-w-0 break-words text-base font-semibold leading-6 text-slate-900">{scheduleLabel}</p>
            {period && <p className="shrink-0 text-sm leading-6 text-slate-500">{period}</p>}
          </div>
        </div>

        <div role="region" aria-label="Reuse issues" className="space-y-4">
          {categories.map((item) => {
            const group = described.filter((issue) => issue.category === item.key);
            const sections = Array.from(new Set(group.filter((issue) => issue.section && issue.course).map((issue) => issue.section!)));
            const otherIssues = group.filter((issue) => !issue.section || !issue.course);
            return (
              <section key={item.key} aria-label={item.label} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{item.label}</h3>
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">{group.length} {group.length === 1 ? 'issue' : 'issues'}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.guidance}</p>
                  {sections.length > 0 && <p className="mt-2 text-xs font-medium text-slate-500">{sections.length} affected {sections.length === 1 ? 'section' : 'sections'}</p>}
                </div>
                {sections.length > 0 && (
                  <ul aria-label="Already scheduled sections" className="divide-y divide-slate-100">
                    {sections.map((section) => {
                      const sectionIssues = group.filter((issue) => issue.section === section && issue.course);
                      const courses = Array.from(new Set(sectionIssues.map((issue) => issue.course!)));
                      return (
                        <li key={section} className="px-4 py-4 sm:px-5">
                          <div className="grid gap-3 sm:grid-cols-[minmax(8rem,0.7fr)_minmax(0,3fr)] sm:gap-5">
                            <div>
                              <h4 className="break-words text-sm font-semibold leading-6 text-slate-900">{section}</h4>
                              <p className="text-xs leading-5 text-slate-500">{sectionIssues.length} {sectionIssues.length === 1 ? 'issue' : 'issues'}</p>
                            </div>
                            <div className="min-w-0">
                              <ul aria-label={`${section} courses already scheduled`} className="flex flex-wrap gap-2">
                                {courses.map((course) => <li key={course} className="max-w-full break-words rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium leading-5 text-slate-700">{course}</li>)}
                              </ul>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {otherIssues.length > 0 && (
                  <ul aria-label={`${item.label} issues`} className="divide-y divide-slate-100">
                    {otherIssues.map((issue) => <li key={issue.index} className="break-words px-4 py-4 text-sm leading-6 text-slate-700 sm:px-5">{issue.message}</li>)}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
