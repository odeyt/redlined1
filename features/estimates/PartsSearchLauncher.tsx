'use client';

/**
 * The Search Parts button and the dialog it opens.
 *
 * Extracted from EstimatesView so the interaction has one owner and can be
 * tested without an authenticated estimate. It holds exactly two things — the
 * open flag and the dialog — and hands everything else back to the estimate.
 *
 * ## Why this is its own component
 *
 * The button and the dialog were a hundred lines apart in a two-thousand-line
 * view. Nothing was wrong with either, and the bug lived in the gap: the
 * dialog rendered inside the estimate panel, beneath the application chrome.
 * Keeping the pair together makes that class of mistake visible.
 *
 * ## Two rules it must not break
 *
 * `type="button"`. It sits inside the estimate's <form>, and a button without
 * an explicit type defaults to submit — clicking Search Parts would save the
 * estimate.
 *
 * The dialog opens even when no provider is configured. A button that does
 * nothing because a credential is missing is indistinguishable from a broken
 * button; the honest state belongs INSIDE the dialog, where it can also say
 * that manual entry still works.
 */
import { useState } from 'react';
import { PartsSearchModal, type AddPartPayload, type PartsSearchVehicle } from './PartsSearchModal';

interface Props {
  shopId: string;
  currency: string;
  vehicle: PartsSearchVehicle;
  vehicleLabel?: string;
  onAdd: (payload: AddPartPayload) => void;
  /** Styling hook so the estimate keeps its own button language. */
  className?: string;
}

export function PartsSearchLauncher({
  shopId, currency, vehicle, vehicleLabel, onAdd, className,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        // Explicit. Inside a <form> the default is submit.
        type="button"
        data-testid="search-parts-button"
        className={className}
        onClick={() => setOpen(true)}
      >
        🔍 Search Parts
      </button>

      {/* Mounted only while open, so closing discards the previous search
          rather than leaving it behind a hidden dialog. */}
      {open && (
        <PartsSearchModal
          open={open}
          onClose={() => setOpen(false)}
          shopId={shopId}
          currency={currency}
          vehicle={vehicle}
          vehicleLabel={vehicleLabel}
          onAdd={payload => {
            onAdd(payload);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
