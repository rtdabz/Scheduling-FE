/**
 * Where a department sits in the schedule approval pipeline.
 *
 * The dashboard's STAGES list names every state the backend can report, and one
 * of them — "Returned by Dean" — is not a step forward: it hands the schedules
 * back to the department. Drawing it as stage 4 of 6 rendered a rejection as
 * progress, with the earlier steps ticked green and approval apparently one step
 * away. The milestones below are the four positions that only ever move forward,
 * and a return is reported on its own so the UI can show it as the exception it
 * is rather than as an advance.
 */
export const SUBMISSION_MILESTONES = ['Drafting', 'Submitted', 'Dean', 'VPAA'] as const;

/** Full names for the abbreviated milestone labels, for tooltips. */
export const MILESTONE_TITLES: Record<string, string> = {
  Drafting: 'Drafting in the department',
  Submitted: 'Submitted to the Dean',
  Dean: 'Approved by the Dean',
  VPAA: 'Approved by the VPAA',
};

/** Milestone each STAGES index maps onto. Index 3 is "Returned by Dean". */
const MILESTONE_OF_STAGE = [0, 0, 1, 0, 2, 3];
const RETURNED_STAGE = 3;
const APPROVED_STAGE = 5;

export interface SubmissionProgress {
  /** Milestone the department is sitting at now. */
  at: number;
  /** How many milestones are fully behind it — the ticked ones. */
  done: number;
  /** The Dean sent sections back, so the department is drafting again. */
  isReturned: boolean;
  /** Approved all the way through; nothing is left in flight. */
  isComplete: boolean;
}

export const submissionProgress = (stage: number): SubmissionProgress => {
  const clamped = Math.min(Math.max(Math.trunc(stage) || 0, 0), MILESTONE_OF_STAGE.length - 1);
  const isComplete = clamped === APPROVED_STAGE;
  const at = MILESTONE_OF_STAGE[clamped];
  return {
    at,
    // A returned department has nothing behind it: the submission it had made was
    // undone, so drafting is in progress again rather than ticked off.
    done: isComplete ? SUBMISSION_MILESTONES.length : at,
    isReturned: clamped === RETURNED_STAGE,
    isComplete,
  };
};
