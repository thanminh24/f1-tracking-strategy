// POST /api/whatif wrapper with abort support (one in-flight request at a time).
import { API_BASE } from "./api-client";
import type { WhatIfResponse } from "./prediction-types";

export interface WhatIfParams {
  session_key: string;
  lap: number;
  car_id: string;
  action: string; // PIT_SOFT | PIT_MEDIUM | PIT_HARD | STAY_N
  stay_laps?: number;
}

let controller: AbortController | null = null;

export async function runWhatIf(params: WhatIfParams): Promise<WhatIfResponse> {
  controller?.abort(); // new scenario supersedes the in-flight one
  controller = new AbortController();
  const res = await fetch(`${API_BASE}/api/whatif`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail ?? `what-if failed: ${res.status}`);
  }
  return res.json();
}
