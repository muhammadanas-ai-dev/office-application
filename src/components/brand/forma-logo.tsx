import { cn } from "@/lib/utils";

type FormaLogoProps = {
  /** Icon size in px. */
  size?: number;
  /** Show the "Forma Office" wordmark next to the mark. */
  showWordmark?: boolean;
  className?: string;
};

/**
 * Original Forma mark: two offset page/sheet outlines forming a subtle
 * F/fold motif. No WPS or Microsoft Office artwork is used.
 */
export function FormaLogo({
  size = 28,
  showWordmark = true,
  className,
}: FormaLogoProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      role="img"
      aria-label="Forma Office"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="3"
          y="2"
          width="15"
          height="20"
          rx="2"
          fill="#ffffff"
          stroke="#3159c9"
          strokeWidth="2"
        />
        <rect
          x="10"
          y="6"
          width="15"
          height="20"
          rx="2"
          fill="#edf1f6"
          stroke="#17253b"
          strokeWidth="2"
        />
        <path
          d="M14 12h7M14 16h7"
          stroke="#3159c9"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark ? (
        <span className="text-lg font-semibold text-[#17253b]">
          Forma <span className="font-normal">Office</span>
        </span>
      ) : null}
    </span>
  );
}
