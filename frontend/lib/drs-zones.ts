// DRS zone definitions for F1 circuits
// Each zone has detection (warning point), activation (DRS opens), and end lap_fraction values

export interface DrsZone {
  detection: number;  // lap_fraction of detection loop
  activation: number; // lap_fraction where DRS opens
  end: number;        // lap_fraction where zone ends
}

export const DRS_ZONES: Record<string, DrsZone[]> = {
  // Bahrain International Circuit
  "Bahrain": [
    { detection: 0.80, activation: 0.83, end: 0.92 },
    { detection: 0.92, activation: 0.95, end: 0.04 },
  ],
  // Jeddah Corniche Circuit (Saudi Arabia)
  "Saudi Arabia": [
    { detection: 0.25, activation: 0.28, end: 0.38 },
    { detection: 0.55, activation: 0.58, end: 0.68 },
    { detection: 0.78, activation: 0.81, end: 0.91 },
  ],
  // Melbourne (Australia)
  "Australia": [
    { detection: 0.15, activation: 0.18, end: 0.27 },
    { detection: 0.70, activation: 0.73, end: 0.82 },
  ],
  // Imola (Emilia-Romagna)
  "Emilia Romagna": [
    { detection: 0.05, activation: 0.08, end: 0.18 },
    { detection: 0.70, activation: 0.73, end: 0.81 },
  ],
  // Monaco
  "Monaco": [
    { detection: 0.55, activation: 0.58, end: 0.67 },
  ],
  // Barcelona (Spain)
  "Spain": [
    { detection: 0.05, activation: 0.08, end: 0.17 },
    { detection: 0.75, activation: 0.78, end: 0.87 },
  ],
  // Silverstone (Britain)
  "Great Britain": [
    { detection: 0.08, activation: 0.11, end: 0.22 },
    { detection: 0.75, activation: 0.78, end: 0.88 },
  ],
  // Spa-Francorchamps (Belgium)
  "Belgium": [
    { detection: 0.05, activation: 0.08, end: 0.22 },
    { detection: 0.78, activation: 0.81, end: 0.94 },
  ],
  // Monza (Italy)
  "Italy": [
    { detection: 0.10, activation: 0.13, end: 0.23 },
    { detection: 0.72, activation: 0.75, end: 0.85 },
  ],
  // Abu Dhabi (Yas Marina)
  "Abu Dhabi": [
    { detection: 0.05, activation: 0.08, end: 0.20 },
    { detection: 0.65, activation: 0.68, end: 0.80 },
  ],
};

// Normalize circuit name to match DRS_ZONES keys (fuzzy matching)
export function normalizeDrsCircuit(circuit: string | undefined): string | undefined {
  if (!circuit) return undefined;
  const c = circuit.toLowerCase();
  const keys = Object.keys(DRS_ZONES);

  // Direct match
  const direct = keys.find(k => k.toLowerCase() === c);
  if (direct) return direct;

  // Substring match
  const substring = keys.find(k => k.toLowerCase().includes(c) || c.includes(k.toLowerCase()));
  if (substring) return substring;

  return undefined;
}
