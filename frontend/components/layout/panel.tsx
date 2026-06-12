// Reusable bordered panel card — the visual building block for every dashboard section.
import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  title?: string;
  className?: string;
  /** Remove default padding (for panels that manage their own internal padding) */
  noPad?: boolean;
  /** Extra element rendered beside the title (badges, toggles, etc.) */
  action?: ReactNode;
}

export function Panel({ children, title, className = "", noPad, action }: PanelProps) {
  return (
    <div
      className={`bg-f1-panel border border-f1-border rounded-lg overflow-hidden ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-f1-border">
          <span className="text-[10px] font-sans font-semibold uppercase tracking-widest text-f1-muted">
            {title}
          </span>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={noPad ? "" : "p-3"}>{children}</div>
    </div>
  );
}
