export default function RouteLoadingBar() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden print:hidden"
      role="progressbar"
      aria-busy="true"
      aria-label="Loading module"
    >
      <div className="h-full w-1/3 animate-indeterminate rounded-full bg-amber-400" />
    </div>
  );
}
