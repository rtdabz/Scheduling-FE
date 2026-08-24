import type { CSSProperties } from "react";

export interface LoadingSpinnerProps {
  /** Diameter of the spinner in pixels. */
  size?: number;
  /** Spinner color. Defaults to the surrounding text color. */
  color?: string;
  /** Accessible label announced while loading. */
  label?: string;
  className?: string;
}

const spinnerStyles = `
  @keyframes wicars-loader-shadow-spin {
    0%, 5%, 95%, 100% {
      box-shadow:
        0 -0.83em 0 -0.4em,
        0 -0.83em 0 -0.42em,
        0 -0.83em 0 -0.44em,
        0 -0.83em 0 -0.46em,
        0 -0.83em 0 -0.477em;
    }
    10%, 59% {
      box-shadow:
        0 -0.83em 0 -0.4em,
        -0.087em -0.825em 0 -0.42em,
        -0.173em -0.812em 0 -0.44em,
        -0.256em -0.789em 0 -0.46em,
        -0.297em -0.775em 0 -0.477em;
    }
    20% {
      box-shadow:
        0 -0.83em 0 -0.4em,
        -0.338em -0.758em 0 -0.42em,
        -0.555em -0.617em 0 -0.44em,
        -0.671em -0.488em 0 -0.46em,
        -0.749em -0.34em 0 -0.477em;
    }
    38% {
      box-shadow:
        0 -0.83em 0 -0.4em,
        -0.377em -0.74em 0 -0.42em,
        -0.645em -0.522em 0 -0.44em,
        -0.775em -0.297em 0 -0.46em,
        -0.82em -0.09em 0 -0.477em;
    }
  }

  @keyframes wicars-loader-round {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .wicars-loader {
    display: inline-block;
    width: 1em;
    height: 1em;
    overflow: hidden;
    border-radius: 50%;
    color: var(--wicars-loader-color);
    font-size: calc(45 * var(--wicars-loader-unit));
    text-indent: -9999em;
    transform: translateZ(0);
    animation:
      wicars-loader-shadow-spin 1.7s infinite ease,
      wicars-loader-round 1.7s infinite ease;
  }
`;

export default function LoadingSpinner({
  // Compact by default so the spinner fits button-sized containers. Larger
  // loading states pass an explicit size.
  size = 16,
  color = "currentColor",
  label = "Loading",
  className = "",
}: LoadingSpinnerProps) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 16;
  const style = {
    "--wicars-loader-color": color,
    "--wicars-loader-unit": `${safeSize / 45}px`,
  } as CSSProperties;

  return (
    <>
      <style>{spinnerStyles}</style>
      <span
        className={`wicars-loader ${className}`.trim()}
        style={style}
        role="status"
        aria-label={label}
        aria-live="polite"
      />
    </>
  );
}
