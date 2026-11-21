// Estimated data: a value that is not measured for this plot (a fixed value of backend/defaults.py, or the
// nearest street) gets a small star, and the card says once, at its bottom, what the star means.

// The star next to an estimated value.
export function EstimatedMark() {
  return (
    <span aria-hidden="true" className="ms-1 font-bold text-caution-500">
      *
    </span>
  );
}

// The note at the bottom of a card that has estimated values: "* بيانات تقديرية".
export function EstimatedNote({ label }: { label: string }) {
  return (
    <p className="mt-4 flex items-center gap-1.5 rounded-control bg-caution-50 px-3 py-1.5 text-xs text-caution-700">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5 shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
      <span>
        <b>*</b> {label}
      </span>
    </p>
  );
}
