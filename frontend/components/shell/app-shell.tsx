"use client";
import type { ReactNode } from "react";
import { Header } from "./header";

interface AppShellProps {
  sessionLabel?: string;
  sessionKey?: string;
  sourceMode?: "live" | "archive";
  children: ReactNode;
}

export function AppShell({ sessionLabel, sessionKey, sourceMode, children }: AppShellProps) {
  return (
    <div className="flex flex-col h-full bg-f1-bg">
      <Header sessionLabel={sessionLabel} sessionKey={sessionKey} sourceMode={sourceMode} />
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
