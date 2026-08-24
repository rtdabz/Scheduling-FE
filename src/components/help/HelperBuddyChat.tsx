import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Bot, ChevronDown, Send, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import robotSpriteSheet from "../../assets/helper-robot-spritesheet.png";
import { buildHelperContext, getHelperReply, type HelperReply } from "../../lib/helperGuidance";
import { getStoredUser } from "../../lib/storedUser";

type ChatMessage = { id: string; sender: "assistant" | "user"; text: string; reply?: HelperReply };

const initialMessage: ChatMessage = {
  id: "welcome",
  sender: "assistant",
  text: "Hello. I can help you with the next step in the scheduling system.",
};

const quickPrompts = ["What should I do next?", "Why can't I submit?", "Show my status"];
const BUDDY_WIDTH = 72;
const BUDDY_HEIGHT = 96;
const VIEWPORT_MARGIN = 8;
const POSITION_STORAGE_KEY = "wicars_helper_buddy_position";

type BuddyPosition = { x: number; y: number };
type BuddyAnimation = "idle" | "working" | "waiting" | "warning" | "success" | "error" | "greeting";
const animationRows: Record<BuddyAnimation, { row: number; frames: number; duration: number }> = {
  idle: { row: 0, frames: 8, duration: 130 },
  working: { row: 1, frames: 10, duration: 100 },
  waiting: { row: 2, frames: 6, duration: 160 },
  warning: { row: 3, frames: 6, duration: 120 },
  success: { row: 4, frames: 8, duration: 130 },
  error: { row: 5, frames: 6, duration: 130 },
  greeting: { row: 6, frames: 6, duration: 140 },
};

function BuddySprite({ animation }: { animation: BuddyAnimation }) {
  const [frame, setFrame] = useState(0);
  const { row, frames, duration } = animationRows[animation];

  useEffect(() => {
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % frames), duration);
    return () => window.clearInterval(timer);
  }, [duration, frames, animation]);

  const displayFrame = frame % frames;
  const x = frames > 1 ? (displayFrame / 9) * 100 : 0;
  const y = (row / 6) * 100;
  const paletteFilter = animation === "warning" || animation === "error"
    ? undefined
    : "hue-rotate(220deg) saturate(0.9)";
  return <span aria-hidden="true" className="block h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${robotSpriteSheet})`, backgroundSize: "1000% 700%", backgroundPosition: `${x}% ${y}%`, filter: paletteFilter }} />;
}

const clampPosition = (position: BuddyPosition): BuddyPosition => ({
  x: Math.min(Math.max(position.x, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, window.innerWidth - BUDDY_WIDTH - VIEWPORT_MARGIN)),
  y: Math.min(Math.max(position.y, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, window.innerHeight - BUDDY_HEIGHT - VIEWPORT_MARGIN)),
});

const initialBuddyPosition = (): BuddyPosition => {
  const fallback = clampPosition({ x: window.innerWidth - BUDDY_WIDTH - 24, y: window.innerHeight - BUDDY_HEIGHT - 24 });
  try {
    const stored = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<BuddyPosition>;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return fallback;
    return clampPosition({ x: Number(parsed.x), y: Number(parsed.y) });
  } catch {
    return fallback;
  }
};

export default function HelperBuddyChat({ draftCount = 0 }: { draftCount?: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [animation, setAnimation] = useState<BuddyAnimation>("greeting");
  const [position, setPosition] = useState<BuddyPosition>(initialBuddyPosition);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: BuddyPosition; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setAnimation("idle"), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const context = useMemo(() => ({
    ...buildHelperContext(location.pathname, getStoredUser(), scheduleStatus),
    draftCount,
  }), [draftCount, location.pathname, scheduleStatus]);

  useEffect(() => {
    const handleHelperEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; type?: string; status?: string; open?: boolean }>).detail;
      if (!detail?.text) return;
      if (detail.status) setScheduleStatus(detail.status);
      setMessages((current) => [...current.slice(-7), { id: crypto.randomUUID(), sender: "assistant", text: detail.text ?? "", }]);
      setAnimation(detail.type === "conflict" ? "warning" : detail.type === "rejected" ? "error" : detail.type === "approved" ? "success" : "waiting");
      // Status and reminder events may update the chat history while it stays
      // minimized. Opening is opt-in for callers that explicitly request it.
      if (detail.open === true) setOpen(true);
    };
    window.addEventListener("show-helper-buddy", handleHelperEvent);
    window.addEventListener("helper-buddy-status", handleHelperEvent);
    return () => {
      window.removeEventListener("show-helper-buddy", handleHelperEvent);
      window.removeEventListener("helper-buddy-status", handleHelperEvent);
    };
  }, []);

  const sendPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || thinking) return;
    setMessages((current) => [...current.slice(-7), { id: crypto.randomUUID(), sender: "user", text: trimmed }]);
    setInput("");
    setThinking(true);
    setAnimation("working");
    window.setTimeout(() => {
      const reply = getHelperReply(trimmed, context);
      setMessages((current) => [...current.slice(-7), { id: crypto.randomUUID(), sender: "assistant", text: reply.text, reply }]);
      setThinking(false);
      setAnimation(reply.intent === "conflict" ? "warning" : reply.intent === "unsupported" ? "error" : "success");
      window.setTimeout(() => setAnimation("idle"), 1400);
    }, 250);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendPrompt(input);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: position, moved: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) >= 4) drag.moved = true;
    if (!drag.moved) return;
    setPosition(clampPosition({ x: drag.origin.x + deltaX, y: drag.origin.y + deltaY }));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    if (!drag.moved) return;
    suppressClickRef.current = true;
    setPosition((current) => {
      const bounded = clampPosition(current);
      try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(bounded)); } catch { /* Position persistence is optional. */ }
      return bounded;
    });
  };

  const toggleBuddy = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
    setAnimation("greeting");
    window.setTimeout(() => setAnimation("idle"), 900);
  };

  const panelOpensBelow = position.y < 390;
  const panelAlignsLeft = position.x < 280;

  return (
    <div className="fixed z-[9999]" style={{ left: position.x, top: position.y }}>
      {open && (
        <section className={`absolute flex w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#C9952A]/40 bg-white shadow-2xl ${panelOpensBelow ? "top-[calc(100%+12px)]" : "bottom-[calc(100%+12px)]"} ${panelAlignsLeft ? "left-0" : "right-0"}`} aria-label="WICARS Buddy chat">
          <header className="flex items-center justify-between bg-[#4e0a10] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#f2c66d]" />
              <span className="text-sm font-bold">WICARS Buddy</span>
              <span className="rounded-full border border-[#f2c66d]/70 bg-[#C9952A]/25 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#fff3cf]">Beta</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Minimize WICARS Buddy"><ChevronDown className="h-4 w-4" /></button>
          </header>
          <div className="max-h-80 space-y-3 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={message.sender === "user" ? "ml-8" : "mr-4"}>
                <div className={message.sender === "user" ? "rounded-xl rounded-br-sm bg-[#4e0a10] px-3 py-2 text-sm text-white" : "rounded-xl rounded-bl-sm border border-[#C9952A]/25 bg-white px-3 py-2 text-sm leading-5 text-slate-700"}>{message.text}</div>
                {message.reply?.action && <button type="button" onClick={() => { navigate(message.reply!.action!.path); setOpen(false); }} className="mt-1 text-xs font-bold text-[#8a5d0a] hover:text-[#4e0a10] hover:underline">{message.reply.action.label}</button>}
              </div>
            ))}
            {thinking && <div className="text-xs text-slate-500">WICARS Buddy is checking the workflow...</div>}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-slate-200 bg-white p-3">
            {quickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => sendPrompt(prompt)} className="rounded-full border border-[#C9952A]/35 bg-[#fff8e8] px-2.5 py-1 text-xs font-semibold text-[#4e0a10] hover:border-[#C9952A] hover:bg-[#fff3cf]">{prompt}</button>)}
          </div>
          <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about the next step..." className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#C9952A] focus:ring-2 focus:ring-[#C9952A]/20" aria-label="Ask WICARS Buddy" />
            <button type="submit" disabled={!input.trim() || thinking} className="rounded-lg bg-[#4e0a10] p-2 text-white transition-colors hover:bg-[#6b0e17] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send className="h-4 w-4" /></button>
          </form>
        </section>
      )}
      <button type="button" onClick={toggleBuddy} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag} className="group relative h-24 w-[72px] touch-none cursor-grab select-none border-0 bg-transparent p-0 transition hover:scale-105 active:cursor-grabbing" aria-label={open ? "Move or close WICARS Buddy" : "Move or open WICARS Buddy"} title="Drag to move or click to open WICARS Buddy">
        <BuddySprite animation={animation} />
        <span className="absolute left-0 top-1 rounded-full border border-[#C9952A] bg-[#4e0a10] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#fff3cf] shadow-md">Beta</span>
        {open && <span className="absolute right-0 top-0 rounded-md bg-[#4e0a10] p-1 text-white shadow"><X className="h-3 w-3" /></span>}
      </button>
    </div>
  );
}
