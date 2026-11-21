import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string; // the tooltip and what screen readers read
  tone?: "default" | "danger"; // danger turns red on hover (delete)
  children: ReactNode; // the icon
};

// A square button that shows only an icon. Its name appears in a tooltip above it on hover and on
// keyboard focus, so the action is always clear.
export default function IconButton({ label, tone = "default", className = "", children, ...props }: IconButtonProps) {
  const hover =
    tone === "danger"
      ? "hover:border-danger-500 hover:text-danger-500 hover:bg-danger-500/5"
      : "hover:border-navy-700 hover:text-navy-900 hover:bg-navy-50";
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className={`flex h-9 w-9 items-center justify-center rounded-control border border-navy-900/15 bg-white text-navy-900/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-700 ${hover} ${className}`}
        {...props}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-control bg-navy-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

const icon = "h-4 w-4";

export function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={icon}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={icon}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

// A filled heart: the project is a favorite (pressing it removes it from the favorites).
export function HeartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={`${icon} text-gold-600`}>
      <path d="M12 21s-7.5-4.6-10-9.3C.4 8.3 2.4 4 6.3 4c2.2 0 3.6 1.2 4.4 2.4h2.6C14.1 5.2 15.5 4 17.7 4c3.9 0 5.9 4.3 4.3 7.7C19.5 16.4 12 21 12 21Z" />
    </svg>
  );
}
