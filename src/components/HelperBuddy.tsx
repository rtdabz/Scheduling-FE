import React, { useEffect, useState } from "react";

export type MessageType = "conflict" | "info" | "approved" | "rejected";

export type HelperMessage = {
  id: string;
  text: string;
  type: MessageType;
};

// Maps each message type to a facial expression state
const expressionByType: Record<MessageType, "worried" | "neutral" | "happy" | "sad"> = {
  conflict: "worried",
  info: "neutral",
  approved: "happy",
  rejected: "sad",
};

function StudentFace({ expression }: { expression: "worried" | "neutral" | "happy" | "sad" }) {
  // Eyebrow paths per expression
  const brows = {
    worried: (
      <>
        <path d="M28 40 Q34 46 40 41" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M60 41 Q66 46 72 40" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ),
    neutral: (
      <>
        <path d="M28 39 Q34 36 40 39" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M60 39 Q66 36 72 39" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ),
    happy: (
      <>
        <path d="M28 38 Q34 34 40 37" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M60 37 Q66 34 72 38" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ),
    sad: (
      <>
        <path d="M28 42 Q34 38 40 40" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M60 40 Q66 38 72 42" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
      </>
    ),
  };

  // Mouth paths per expression
  const mouths = {
    worried: <ellipse cx="50" cy="62" rx="6" ry="7" fill="#5A1220" />,
    neutral: <path d="M42 60 Q50 66 58 60" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />,
    happy: <path d="M38 58 Q50 72 62 58" stroke="#5A1220" strokeWidth="3.5" fill="none" strokeLinecap="round" />,
    sad: <path d="M40 66 Q50 58 60 66" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />,
  };

  const isHappy = expression === "happy";

  return (
    <svg viewBox="0 0 100 100" width="64" height="64">
      {/* head */}
      <circle cx="50" cy="46" r="36" fill="#FCEFE3" stroke="#5A1220" strokeWidth="2.5" />
      {/* hair */}
      <path d="M16 40 Q20 8 50 8 Q80 8 84 40 Q70 26 50 26 Q30 26 16 40 Z" fill="#3A2B22" />
      {/* eyes: closed curve when happy, open circle otherwise (blink handled by CSS) */}
      {isHappy ? (
        <>
          <path d="M30 50 Q35 44 40 50" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M60 50 Q65 44 70 50" stroke="#5A1220" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle className="buddy-eye" cx="35" cy="50" r="4.5" fill="#5A1220" />
          <circle className="buddy-eye" cx="65" cy="50" r="4.5" fill="#5A1220" />
        </>
      )}
      {brows[expression]}
      {mouths[expression]}
      {/* cheeks */}
      <circle cx="26" cy="58" r="5" fill="#F5A623" opacity="0.35" />
      <circle cx="74" cy="58" r="5" fill="#F5A623" opacity="0.35" />
      {/* collar / uniform */}
      <path d="M20 92 Q50 78 80 92 L84 100 L16 100 Z" fill="#5A1220" />
      <path d="M42 82 L50 92 L58 82" fill="#F5A623" />
    </svg>
  );
}

const InfoIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#D97706" }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const ConflictIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#DC2626" }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ApprovedIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#059669" }}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const RejectedIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#DC2626" }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const typeConfigs: Record<MessageType, { title: string; icon: React.ReactNode; borderColor: string; iconBgColor: string; titleColor: string }> = {
  conflict: {
    title: "Conflict Detected",
    icon: ConflictIcon,
    borderColor: "#DC2626",
    iconBgColor: "#FEE2E2",
    titleColor: "#991B1B",
  },
  info: {
    title: "Scheduling Tip",
    icon: InfoIcon,
    borderColor: "#D97706",
    iconBgColor: "#FEF3C7",
    titleColor: "#92400E",
  },
  approved: {
    title: "Schedule Approved",
    icon: ApprovedIcon,
    borderColor: "#059669",
    iconBgColor: "#D1FAE5",
    titleColor: "#065F46",
  },
  rejected: {
    title: "Action Required",
    icon: RejectedIcon,
    borderColor: "#DC2626",
    iconBgColor: "#FEE2E2",
    titleColor: "#991B1B",
  },
};

const ALLOWED_REMINDERS = [
  "There's a conflict. Here are some recommended approaches...",
  "The submitted schedule has been approved/rejected by the Dean/VPAA.",
  "You can edit a schedule by clicking its card"
];

const shownTexts = new Set<string>();

export function HelperBuddy({ message }: { message: HelperMessage | null }) {
  const [visible, setVisible] = useState(false);
  const [expression, setExpression] = useState<"worried" | "neutral" | "happy" | "sad">("neutral");

  useEffect(() => {
    if (!message) return;
    if (!ALLOWED_REMINDERS.includes(message.text)) {
      setVisible(false);
      return;
    }
    if (shownTexts.has(message.text)) {
      setVisible(false);
      return;
    }
    shownTexts.add(message.text);

    setExpression(expressionByType[message.type]);
    setVisible(true);

    if (message.text !== "You can edit a schedule by clicking its card") {
      const timer = setTimeout(() => setVisible(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, display: "flex", alignItems: "flex-end", gap: 12, zIndex: 9999 }}>
      <style>{`
        @keyframes buddy-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes buddy-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.1); }
        }
        @keyframes bubble-in {
          0% { opacity: 0; transform: translateY(8px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .buddy-wrap { animation: buddy-bounce 2.4s ease-in-out infinite; }
        .buddy-eye { transform-origin: center; animation: buddy-blink 4s infinite; }
        .buddy-bubble { animation: bubble-in 0.2s ease-out; }
      `}</style>

      {visible && message && (() => {
        const config = typeConfigs[message.type];

        return (
          <div
            className="buddy-bubble"
            style={{
              position: "relative",
              width: 320,
              background: "#FFFFFF",
              borderRadius: 16,
              borderLeft: `4px solid ${config.borderColor}`,
              padding: "16px",
              fontFamily: "Inter, system-ui, -apple-system, sans-serif",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: config.iconBgColor,
                  }}
                >
                  {config.icon}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: config.titleColor,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {config.title}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setVisible(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#9CA3AF",
                  padding: 4,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
                aria-label="Close"
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#4B5563";
                  e.currentTarget.style.backgroundColor = "#F3F4F6";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#9CA3AF";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div
              style={{
                fontSize: 13.5,
                lineHeight: 1.5,
                fontWeight: 500,
                color: "#4B5563",
              }}
            >
              {message.text}
            </div>

            {/* speech bubble tail decoration */}
            <div
              style={{
                position: "absolute",
                bottom: 20,
                right: -8,
                width: 0,
                height: 0,
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                borderLeft: "8px solid #FFFFFF",
                filter: "drop-shadow(2px 0px 1px rgba(0,0,0,0.05))",
                zIndex: 1,
              }}
            />
          </div>
        );
      })()}

      <div className="buddy-wrap" style={{ cursor: "pointer" }}>
        <StudentFace expression={expression} />
      </div>
    </div>
  );
}
