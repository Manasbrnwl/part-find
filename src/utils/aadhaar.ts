/**
 * Aadhaar helpers — validation, normalization, and masking.
 *
 * Security notes:
 * - The raw 12-digit number must NEVER be logged. Use maskAadhaar() before
 *   putting it anywhere user-visible or in logs.
 * - Validation uses the official Verhoeff checksum (the last digit of a valid
 *   Aadhaar is a Verhoeff check digit), plus the UIDAI rule that the number is
 *   12 digits and never begins with 0 or 1.
 */

// Verhoeff dihedral-group multiplication table
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Verhoeff permutation table
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** True if the digit string passes the Verhoeff checksum. */
function passesVerhoeff(digits: string): boolean {
  let c = 0;
  const reversed = digits.split("").reverse().map((d) => parseInt(d, 10));
  for (let i = 0; i < reversed.length; i++) {
    c = D[c][P[i % 8][reversed[i]]];
  }
  return c === 0;
}

/** Strip spaces/dashes/anything non-digit. Returns a digits-only string. */
export function normalizeAadhaar(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

/**
 * Validate an Aadhaar number. Accepts spaced/dashed input.
 * Rules: exactly 12 digits, first digit 2–9, valid Verhoeff checksum.
 */
export function isValidAadhaarNumber(raw: string): boolean {
  const num = normalizeAadhaar(raw);
  if (!/^[2-9]\d{11}$/.test(num)) return false;
  return passesVerhoeff(num);
}

/**
 * Mask an Aadhaar number for display: "XXXX XXXX 1234".
 * Accepts stored (normalized) or spaced input. Returns null for empty input.
 */
export function maskAadhaar(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const num = normalizeAadhaar(raw);
  if (num.length < 4) return "XXXX XXXX XXXX";
  return `XXXX XXXX ${num.slice(-4)}`;
}
