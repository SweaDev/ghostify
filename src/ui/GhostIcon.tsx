import type { SVGProps } from 'react';

/** Color-emoji fonts in platform order, so 👻 renders the same as elsewhere on the OS. */
export const EMOJI_FONT =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

/** The Ghostify mark: the 👻 emoji, scaled to the element's box (size it with `size-*`). */
export function GhostIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" overflow="visible" aria-hidden="true" {...props}>
      <text
        x="12"
        y="12"
        fontSize="20"
        fontFamily={EMOJI_FONT}
        textAnchor="middle"
        dominantBaseline="central"
      >
        👻
      </text>
    </svg>
  );
}
