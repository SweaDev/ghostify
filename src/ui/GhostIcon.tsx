import type { SVGProps } from 'react';

/** The Ghostify mark: a friendly ghost. Uses currentColor for the body. */
export function GhostIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 2.5c-4.1 0-7 3.1-7 7.1v11.9l2-1.6 1.7 1.6 1.7-1.6 1.6 1.6 1.6-1.6 1.7 1.6 1.7-1.6 2 1.6V9.6c0-4-2.9-7.1-7-7.1z"
      />
      <ellipse cx="9.5" cy="10" rx="1.4" ry="1.8" fill="var(--ghost-eyes, #1e1b4b)" />
      <ellipse cx="14.5" cy="10" rx="1.4" ry="1.8" fill="var(--ghost-eyes, #1e1b4b)" />
    </svg>
  );
}
