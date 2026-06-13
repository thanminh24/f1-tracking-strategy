"use client";
import { useEffect } from "react";

interface HelpLegendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "Space", action: "Play / Pause" },
  { key: "→ / ←", action: "Seek ±5s" },
  { key: "] / [", action: "Speed up / down" },
  { key: "1 / 2 / 3", action: "Race / Telemetry / Stats" },
  { key: "?", action: "Show this help" },
  { key: "Escape", action: "Close dialog" },
];

export function HelpLegendModal({ isOpen, onClose }: HelpLegendModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-f1-panel border border-f1-border rounded-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-f1-text mb-4">
          Keyboard Shortcuts
        </h2>

        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map(({ key, action }) => (
              <tr key={key} className="border-b border-f1-border/40 last:border-0">
                <td className="font-data text-f1-text-dim py-2 pr-4">{key}</td>
                <td className="text-f1-text py-2">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-f1-text-dim mt-4">
          Shortcuts are disabled when typing in input fields.
        </p>
      </div>
    </div>
  );
}
