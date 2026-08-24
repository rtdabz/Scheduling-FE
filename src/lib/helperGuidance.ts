import type { StoredUser } from "./storedUser";

export type HelperRole = "secretary" | "program_head" | "dean" | "vpaa" | "";

export interface HelperContext {
  role: HelperRole;
  route: string;
  scheduleStatus?: string | null;
  draftCount?: number;
  pendingApprovalCount?: number;
  conflictCount?: number;
}

export interface HelperReply {
  text: string;
  intent: "next_step" | "status" | "conflict" | "approval" | "unsupported";
  action?: { label: string; path: string };
}

const unsupportedPattern = /\b(code|coding|program|programming|javascript|typescript|php|laravel|python|sql|api|debug|bug|developer|function|component)\b/i;

const schedulesPath = (role: HelperRole): string => {
  if (role === "program_head") return "/program_head/schedules";
  if (role === "secretary") return "/secretary/schedules";
  if (role === "dean") return "/dean/schedules";
  return "/schedules";
};

const roleOf = (user: StoredUser | null): HelperRole => {
  const role = user?.role?.toLowerCase();
  return role === "secretary" || role === "program_head" || role === "dean" || role === "vpaa" ? role : "";
};

export const buildHelperContext = (route: string, user: StoredUser | null, scheduleStatus?: string | null): HelperContext => ({
  role: roleOf(user),
  route,
  scheduleStatus,
});

export function getHelperReply(prompt: string, context: HelperContext): HelperReply {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized || unsupportedPattern.test(normalized)) {
    return {
      intent: "unsupported",
      text: "I can only help with the next step in this scheduling system. Try asking, \"What should I do next?\"",
    };
  }

  if (/conflict|collision|clash|violation|error/.test(normalized)) {
    return {
      intent: "conflict",
      text: context.conflictCount
        ? `There ${context.conflictCount === 1 ? "is" : "are"} ${context.conflictCount} detected conflict${context.conflictCount === 1 ? "" : "s"}. Review the highlighted room, faculty, and time entries, then choose an available option.`
        : "Review the highlighted room, faculty, and time entries, then choose an available option before submitting.",
      action: { label: context.role === "dean" || context.role === "vpaa" ? "Open Schedules" : "Open Schedule Builder", path: schedulesPath(context.role) },
    };
  }

  if (/approval|approve|submit|send|revision|returned|reject/.test(normalized)) {
    if (context.scheduleStatus === "revision" || context.scheduleStatus === "rejected" || context.scheduleStatus === "rejected_by_dean") {
      return { intent: "approval", text: "Your schedule needs revision. Correct the returned issues, check for conflicts, and submit it again.", action: { label: "Open Schedule Builder", path: schedulesPath(context.role) } };
    }
    if (context.role === "dean") return { intent: "approval", text: "Review each pending department schedule, then approve it or return it with a clear revision reason.", action: { label: "Review Approvals", path: "/dean/schedules/approval" } };
    if (context.role === "vpaa") return { intent: "approval", text: "Review schedules approved by the Dean, then complete the VPAA approval step when the details are correct.", action: { label: "Review Approvals", path: "/schedules/approval" } };
    return { intent: "approval", text: "Submit only after every required section is complete and conflicts have been resolved.", action: { label: "Open Schedule Builder", path: schedulesPath(context.role) } };
  }

  if (/status|progress|how am i doing|completed|pending/.test(normalized)) {
    if (context.pendingApprovalCount) return { intent: "status", text: `There ${context.pendingApprovalCount === 1 ? "is" : "are"} ${context.pendingApprovalCount} schedule${context.pendingApprovalCount === 1 ? "" : "s"} waiting for review.`, action: { label: "Review Approvals", path: context.role === "dean" ? "/dean/schedules/approval" : "/schedules/approval" } };
    if (context.draftCount) return { intent: "status", text: `You still have ${context.draftCount} section${context.draftCount === 1 ? "" : "s"} in draft. Complete those before submitting.` };
    return { intent: "status", text: "Your current workflow status is available on the dashboard and schedule builder." };
  }

  if (/where|find|open|go to|page/.test(normalized)) {
    return { intent: "next_step", text: "Use the sidebar to open the page for the current workflow step. I can guide you if you ask what to do next." };
  }

  if (/next|continue|start|do i do|help/.test(normalized)) {
    if (context.role === "dean") return { intent: "next_step", text: "Your next step is to review pending department schedules and either approve them or return them for revision.", action: { label: "Review Approvals", path: "/dean/schedules/approval" } };
    if (context.role === "vpaa") return { intent: "next_step", text: "Your next step is to review schedules that have already been approved by the Dean.", action: { label: "Review Approvals", path: "/schedules/approval" } };
    if (context.scheduleStatus === "approved") return { intent: "next_step", text: "The schedule is approved. Continue with instructor assignment before finalization.", action: { label: "Assign Instructors", path: context.role === "program_head" ? "/program_head/instructor-assignment" : "/secretary/instructor-assignment" } };
    if (context.scheduleStatus === "faculty_assignment") return { intent: "next_step", text: "Complete the remaining instructor assignments, then continue to finalization.", action: { label: "Assign Instructors", path: context.role === "program_head" ? "/program_head/instructor-assignment" : "/secretary/instructor-assignment" } };
    return { intent: "next_step", text: context.draftCount ? `Complete the ${context.draftCount} remaining draft section${context.draftCount === 1 ? "" : "s"}, then check conflicts before submitting.` : "Open the Schedule Builder and complete the required sections before submitting for approval.", action: { label: "Open Schedule Builder", path: schedulesPath(context.role) } };
  }

  return { intent: "unsupported", text: "I can only help with scheduling workflow steps, statuses, conflicts, and approvals. Try asking, \"What should I do next?\"" };
}
