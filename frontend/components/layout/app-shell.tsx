// App shell: RaceHeader (top) + SideNav (left) + content area (flex-1).
// Server component — RaceHeader and SideNav are "use client" internally.
import type { ReactNode } from "react";
import { RaceHeader } from "./race-header";
import { SideNav } from "./side-nav";

interface AppShellProps {
  children: ReactNode;
  /** Passed through to RaceHeader */
  sessionKey?: string;
  /** Passed through to RaceHeader */
  headerLabel?: string;
  /** Right-side slot for source toggle or other controls in the header */
  headerActions?: ReactNode;
}

export function AppShell({
  children,
  sessionKey,
  headerLabel,
  headerActions,
}: AppShellProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-f1-surface">
      <RaceHeader
        sessionKey={sessionKey}
        label={headerLabel}
        actions={headerActions}
      />
      <div className="flex flex-1 overflow-hidden">
        <SideNav />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
