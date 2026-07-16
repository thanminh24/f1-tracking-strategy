export type RadioDisplayMode = "text" | "audio" | "transcribe";

const STORAGE_KEY = "f1-pw:radio-mode";

export function loadRadioMode(): RadioDisplayMode {
  // Default to auto speech-to-text; the timeline falls back to a placeholder
  // when ASR is offline, and the toggle disables Transcribe in that case.
  if (typeof window === "undefined") return "transcribe";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "audio" || stored === "transcribe" || stored === "text") {
    return stored;
  }
  return "transcribe";
}

export function saveRadioMode(mode: RadioDisplayMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
}
