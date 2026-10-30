const storageKey = "jaothui-competition-return";
const identifier = "[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}";
const qrPath = /^\/dashboard\/competitions\/check-in\/[A-Za-z0-9._-]{20,300}$/;
const detailPath = new RegExp(
  `^/dashboard/competitions/${identifier}/applications/${identifier}$`,
);

/** Only concrete competition destinations we own; never accept URLs, query strings or encoded paths. */
export function safeCompetitionReturnTarget(value: unknown): string | null {
  if (typeof value !== "string" || value.includes("..") || value.includes("%"))
    return null;
  return qrPath.test(value) || detailPath.test(value) ? value : null;
}
export function rememberCompetitionReturn(value: unknown) {
  const path = safeCompetitionReturnTarget(value);
  if (!path) return;
  try {
    sessionStorage.setItem(storageKey, path);
  } catch {
    /* Login stays usable when storage is unavailable. */
  }
}
export function consumeCompetitionReturn(): string {
  try {
    const value = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    return safeCompetitionReturnTarget(value) ?? "/dashboard";
  } catch {
    return "/dashboard";
  }
}
export function clearCompetitionReturn() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* No persistent return target. */
  }
}
