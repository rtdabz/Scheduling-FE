import type { ReactNode } from "react";
import { AlertTriangle, ShieldAlert, type LucideIcon } from "lucide-react";
import CollapsibleNotice from "./CollapsibleNotice";

export type SchedulingCondition = {
  id: string;
  /** "critical" conditions (such as a locked year level) open the list by default. */
  tone: "warning" | "critical";
  icon: LucideIcon;
  title: string;
  text: ReactNode;
};

const toneStyles = {
  warning: { icon: "bg-amber-50 text-amber-700", title: "text-slate-900" },
  critical: { icon: "bg-rose-50 text-rose-700", title: "text-rose-800" },
} as const;

/** One compact, collapsible notice for the conditions that may affect a generation run. */
export default function SchedulingConditions({
  conditions,
  className = "",
}: {
  conditions: SchedulingCondition[];
  className?: string;
}) {
  if (conditions.length === 0) return null;

  const hasCritical = conditions.some((condition) => condition.tone === "critical");

  return (
    <CollapsibleNotice
      icon={hasCritical ? ShieldAlert : AlertTriangle}
      label="Scheduling conditions"
      count={conditions.length}
      description="May affect how this run is generated"
      tone={hasCritical ? "critical" : "warning"}
      forceOpen={hasCritical}
      className={className}
    >
      <ul className="divide-y divide-slate-100">
        {conditions.map((condition) => {
          const Icon = condition.icon;
          const styles = toneStyles[condition.tone];
          return (
            <li key={condition.id} className="flex items-start gap-2.5 px-3 py-2">
              <span
                aria-hidden="true"
                className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${styles.icon}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className={`text-xs font-bold leading-5 ${styles.title}`}>{condition.title}</p>
                <p className="text-xs leading-snug text-slate-600">{condition.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </CollapsibleNotice>
  );
}
