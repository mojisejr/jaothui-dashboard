/** Preserve the exact legacy DB key; encoding prevents it from changing URL structure. */
export function encodeSourceMicrochip(value: string): string | null {
  if (value.length === 0 || value.length > 128) return null;
  try {
    return encodeURIComponent(value);
  } catch {
    // Invalid surrogate sequences cannot be represented exactly in a URL.
    return null;
  }
}
