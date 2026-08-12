/**
 * Bring the top of the list into view after creating something.
 *
 * New records are prepended, so a created job card or inspection appears at
 * the top of its list — but the create form is long, and after saving you are
 * left scrolled wherever you were. On a phone that means the confirmation and
 * the new row are both off-screen, and the only way to find out whether the
 * save worked is to scroll up. Reported as "once something is created, right
 * away I should be able to see that something was created."
 *
 * Scrolls the app's scrolling container as well as the window because which
 * one actually moves depends on the layout: `.content` is a grid inside a
 * full-height shell, and on some breakpoints the page scrolls instead.
 * Scrolling something already at the top is a no-op, so doing both is safe.
 */
export function revealNewRecord(): void {
  if (typeof window === 'undefined') return;

  const behavior: ScrollBehavior =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const content = document.querySelector('.content');
  if (content && content.scrollHeight > content.clientHeight) {
    content.scrollTo({ top: 0, behavior });
  }
  window.scrollTo({ top: 0, behavior });
}
