/**
 * Suspense fallback for a page's code chunk. Deliberately not a skeleton: every
 * page renders its own layout-matched skeleton while its data loads, so a
 * generic one here showed first, in the wrong shape, then got swapped for the
 * real one. A thin bar signals progress without guessing the page's layout.
 *
 * Pinned to the top edge of the viewport, above the SystemHeader (z-50), rather
 * than rendered in the page body where the fallback happens to mount.
 */
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
