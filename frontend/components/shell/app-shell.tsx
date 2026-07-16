"use client";
import type { ReactNode } from "react";
import { Header } from "./header";
import type { WorkspaceMode } from "../../lib/types";

interface AppShellProps {
  sessionLabel?: string;
  sessionKey?: string;
  sourceMode?: "live" | "archive" | "fixture";
  workspaceMode?: WorkspaceMode;
  onWorkspaceChange?: (mode: WorkspaceMode) => void;
  children: ReactNode;
}

export function AppShell({
  sessionLabel,
  sessionKey,
  sourceMode,
  workspaceMode,
  onWorkspaceChange,
  children,
}: AppShellProps) {
  return (
    <div className="flex flex-col h-full bg-f1-bg">
      <Header
        sessionLabel={sessionLabel}
        sessionKey={sessionKey}
        sourceMode={sourceMode}
        workspaceMode={workspaceMode}
        onWorkspaceChange={onWorkspaceChange}
      />
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
