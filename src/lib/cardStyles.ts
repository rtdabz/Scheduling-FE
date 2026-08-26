/**
 * Hover affordance shared by every card-based grid view.
 *
 * `index.css` disables box-shadow globally (`[class*="shadow"]` gets
 * `box-shadow: none !important`), so `hover:shadow-md` on a card is inert. The
 * lift has to come from a transform and the emphasis from the border instead.
 */

/**
 * Drop-in hover state for a grid card: it scales up slightly and its border
 * goes gold. Self-contained, so when applying it remove any `transition-all
 * duration-*` and `hover:border-*` already on the card rather than leaving both
 * — they set the same properties and would fight over CSS order.
 *
 * The border is the *only* thing that changes colour. Cards deliberately do not
 * re-tint their own contents on hover, so keep `group-hover:text-*` and
 * `group-hover:bg-*` off everything inside the card.
 *
 * The card also needs a stacking context (`relative`) for `hover:z-10` to lift
 * it over its neighbours while it is scaled up.
 */
export const GRID_CARD_HOVER =
  'transition-all duration-200 hover:border-[#C9952A] hover:scale-[1.02] hover:z-10 motion-reduce:transition-none motion-reduce:hover:scale-100';

/** Shared hover affordance for table rows and table-like list rows. */
export const TABLE_ROW_HOVER =
  'group border-l-4 border-l-transparent transition-colors duration-200 hover:border-l-[#C9952A] hover:bg-[#5A1220]/5 motion-reduce:transition-none';
