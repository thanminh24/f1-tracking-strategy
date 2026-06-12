"use client";
import type { ReactNode } from "react";
import { Header } from "./header";

interface AppShellProps {
  sessionLabel?: string;
  sourceMode?: "live" | "archive";
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  children: ReactNode;
}

export function AppShell({
  sessionLabel,
  sourceMode,
  activeTab,
  onTabChange,
  children,
}: AppShellProps) {
  return (
    <div className="flex flex-col h-full bg-f1-bg">
      <Header
        sessionLabel={sessionLabel}
        sourceMode={sourceMode}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
      <main className="flex-1 min-h-0 overflow-auto scrollbar-thin">{children}</main>
    </div>
  );
}
