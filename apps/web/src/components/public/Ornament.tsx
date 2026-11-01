/**
 * The small brass mark that carries the guest menu's branding: on the header,
 * on every category tile and in the footer. Drawn rather than shipped so it
 * stays sharp at any size and inherits the accent colour from the page.
 */
export default function Ornament({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="2"
        transform="rotate(45 12 12)"
      />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 1.4v2.2M12 20.4v2.2M1.4 12h2.2M20.4 12h2.2" />
    </svg>
  );
}
