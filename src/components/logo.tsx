/** The ShareAnything mark (same artwork as src/app/icon.svg). */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        {/* Every copy defines the same gradient, so a shared id is fine. */}
        <linearGradient id="sa-logo-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a4d" />
          <stop offset="1" stopColor="#f2461f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#sa-logo-tile)" />
      <rect x="21" y="10" width="28" height="36" rx="5" fill="#ffffff" fillOpacity="0.38" transform="rotate(9 35 28)" />
      <path d="M15 17a5 5 0 0 1 5-5h15.5L45 21.5V47a5 5 0 0 1-5 5H20a5 5 0 0 1-5-5z" fill="#ffffff" />
      <path d="M35.5 12v6.5a3 3 0 0 0 3 3H45z" fill="#ffd3c4" />
      <rect x="21" y="28" width="17" height="3.4" rx="1.7" fill="#0b1420" />
      <rect x="21" y="35" width="12" height="3.4" rx="1.7" fill="#0b1420" fillOpacity="0.35" />
      <circle cx="45" cy="46" r="7.5" fill="#0f766e" stroke="#ffffff" strokeWidth="3" />
    </svg>
  );
}

/** Mark + name + tagline, used at the top-left of every page. */
export function Brand({ tagline }: { tagline: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <LogoMark className="h-9 w-9 shrink-0 drop-shadow-[0_6px_14px_rgba(242,70,31,0.35)] transition group-hover:-rotate-6 sm:h-11 sm:w-11" />
      {/* Very narrow phones: the logo mark alone (the header buttons need the room). */}
      <span className="hidden min-w-0 min-[420px]:block">
        <span className="block truncate font-display text-[1.35rem] leading-none tracking-tight text-ink transition group-hover:text-accent sm:text-[1.85rem]">
          ShareAnything
        </span>
        <span className="mt-1 block truncate text-xs text-ink/75 sm:text-sm">{tagline}</span>
      </span>
    </span>
  );
}
