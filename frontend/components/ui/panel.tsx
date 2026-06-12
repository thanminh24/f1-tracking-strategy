// Base panel card used throughout the strategy sidebar.
import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
}

export function Panel({ title, action, children, className = "", noPad }: PanelProps) {
  return (
    <div
      className={`rounded-lg border border-f1-border bg-f1-panel overflow-hidden ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-f1-border">
          {title && (
            <span className="text-xs font-semibold text-f1-text-dim uppercase tracking-widest">
              {title}
            </span>
          )}
          {action && <div className="flex items-center gap-1.5">{action}</div>}
        </div>
      )}
      <div className={noPad ? "" : "p-3"}>{children}</div>
    </div>
  );
}
