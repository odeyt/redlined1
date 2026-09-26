/**
 * Open a specific repair order on the Repair Orders screen.
 *
 * The existing hand-off (switch module, then fire `open-ro` 80 ms later) only
 * works if the screen has already loaded its list — on a cold load the event
 * arrives first and nothing opens. Here the request is also held until the
 * screen asks for it after loading, so it cannot be missed either way.
 */

let pendingRoNumber: string | null = null;

export function requestOpenRepairOrder(roNumber: string): void {
  pendingRoNumber = roNumber;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-ro', { detail: { roNumber } }));
  }
}

/** Called by the Repair Orders screen once its list is loaded. Returns and clears the request. */
export function takePendingRepairOrder(): string | null {
  const ro = pendingRoNumber;
  pendingRoNumber = null;
  return ro;
}
