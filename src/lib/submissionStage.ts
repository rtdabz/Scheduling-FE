export const SUBMISSION_MILESTONES = ['Drafting', 'Submitted', 'Dean', 'VPAA'] as const;

export const MILESTONE_TITLES: Record<string, string> = {
  Drafting: 'Drafting in the department',
  Submitted: 'Submitted to the Dean',
  Dean: 'Approved by the Dean',
  VPAA: 'Approved by the VPAA',
};

const MILESTONE_OF_STAGE = [0, 0, 1, 0, 2, 3];
const RETURNED_STAGE = 3;
const APPROVED_STAGE = 5;

export interface SubmissionProgress {
  at: number;
  done: number;
  isReturned: boolean;
  isComplete: boolean;
}

export const submissionProgress = (stage: number): SubmissionProgress => {
  const clamped = Math.min(Math.max(Math.trunc(stage) || 0, 0), MILESTONE_OF_STAGE.length - 1);
  const isComplete = clamped === APPROVED_STAGE;
  const at = MILESTONE_OF_STAGE[clamped];
  return {
    at,
    done: isComplete ? SUBMISSION_MILESTONES.length : at,
    isReturned: clamped === RETURNED_STAGE,
    isComplete,
  };
};
