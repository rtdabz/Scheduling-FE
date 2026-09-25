/**
 * Suspense fallback for a page's code chunk. Deliberately not a skeleton: every
 * page renders its own layout-matched skeleton while its data loads, so a
 * generic one here showed first, in the wrong shape, then got swapped for the
 * real one. A thin bar signals progress without guessing the page's layout.
 */
export default function RouteLoadingBar() {
  return (
    <div
      className="h-0.5 w-full overflow-hidden rounded-full bg-gray-200"
      role="progressbar"
      aria-busy="true"
      aria-label="Loading module"
    >
      <div className="h-full w-1/3 animate-indeterminate rounded-full bg-gray-400" />
    </div>
  );
}
