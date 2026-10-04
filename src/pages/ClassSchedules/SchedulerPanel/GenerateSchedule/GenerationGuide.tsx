import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Search } from "lucide-react";
import SlideOverPanel from "./SlideOverPanel";
import {
  GENERATION_GUIDE,
  searchGuide,
  type GuideEntry,
} from "./generationGuideContent";

export default function GenerationGuide({
  initialChapterId,
  onClose,
}: {
  initialChapterId?: string;
  onClose: () => void;
}) {
  const initialIndex = Math.max(
    0,
    GENERATION_GUIDE.findIndex((chapter) => chapter.id === initialChapterId),
  );
  const [chapterIndex, setChapterIndex] = useState(initialIndex);
  const [query, setQuery] = useState("");
  const bodyTopRef = useRef<HTMLDivElement>(null);
  const chapter = GENERATION_GUIDE[chapterIndex];
  const results = searchGuide(query);
  const searching = query.trim() !== "";

  useEffect(() => {
    bodyTopRef.current?.scrollIntoView({ block: "start" });
  }, [chapterIndex]);

  return (
    <SlideOverPanel
      ariaLabel="Generation Guide"
      icon={<BookOpen className="h-5 w-5" />}
      heading={<h3 className="text-base font-black tracking-tight">Generation Guide</h3>}
      subheading="What each setting means and how it shapes the timetable"
      onClose={onClose}
      footer={(close) => (
        <>
          <button
            type="button"
            disabled={searching || chapterIndex === 0}
            onClick={() => setChapterIndex((index) => index - 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button
            type="button"
            onClick={() => close()}
            className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100"
          >
            Close
          </button>
          <button
            type="button"
            disabled={searching || chapterIndex === GENERATION_GUIDE.length - 1}
            onClick={() => setChapterIndex((index) => index + 1)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#4e0a10] px-3 py-2 text-xs font-black text-white transition hover:bg-[#34070a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    >
      <div ref={bodyTopRef} className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Search the guide</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search, e.g. split, required day, room"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/10"
          />
        </label>

        {!searching && (
          <nav aria-label="Guide chapters" className="flex flex-wrap gap-1.5">
            {GENERATION_GUIDE.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-current={index === chapterIndex ? "page" : undefined}
                onClick={() => setChapterIndex(index)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-black transition ${
                  index === chapterIndex
                    ? "bg-[#4e0a10] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.title}
              </button>
            ))}
          </nav>
        )}
      </div>

      {searching ? (
        results.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">
            Nothing in the guide matches “{query.trim()}”.
          </p>
        ) : (
          results.map((result) => (
            <section key={result.chapter.id} className="space-y-3">
              <h4 className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                {result.chapter.title}
              </h4>
              {result.entries.map((entry) => (
                <GuideEntryCard key={entry.term} entry={entry} />
              ))}
            </section>
          ))
        )
      ) : (
        <section className="space-y-3">
          <div>
            {chapter.step && (
              <p className="text-[11px] font-black uppercase tracking-wide text-[#C9952A]">
                Step {chapter.step}
              </p>
            )}
            <h4 className="text-lg font-black text-slate-900">{chapter.title}</h4>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{chapter.intro}</p>
          </div>
          {chapter.entries.map((entry) => (
            <GuideEntryCard key={entry.term} entry={entry} />
          ))}
        </section>
      )}
    </SlideOverPanel>
  );
}

function GuideEntryCard({ entry }: { entry: GuideEntry }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h5 className="text-sm font-black text-[#4e0a10]">{entry.term}</h5>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{entry.meaning}</p>
      {entry.whenToUse && (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          <span className="font-black text-slate-800">When to use: </span>
          {entry.whenToUse}
        </p>
      )}
      {entry.example && (
        <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900">
          <span className="font-black">Example: </span>
          {entry.example}
        </p>
      )}
      {entry.notes && entry.notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-600">
          {entry.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
