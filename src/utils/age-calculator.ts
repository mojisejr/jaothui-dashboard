const toValidDate = (dateInput: string | Date | undefined): Date | null => {
  if (!dateInput) return null;

  const parsedDate = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(parsedDate.getTime())) {
    console.warn("Invalid date input:", dateInput);
    return null;
  }

  return parsedDate;
};

/**
 * Calculate age in months from birthday (rounded down / full months only).
 * @param birthday - Birthday in date-like string format
 * @param referenceDateInput - Optional reference date (default: now)
 * @returns Age in months (rounded down)
 */
export const calculateAgeInMonths = (
  birthday: string | undefined,
  referenceDateInput?: string | Date,
): number => {
  const birthDate = toValidDate(birthday);
  const referenceDate = toValidDate(referenceDateInput ?? new Date());

  if (!birthDate || !referenceDate) return 0;

  const years = referenceDate.getFullYear() - birthDate.getFullYear();
  const months = referenceDate.getMonth() - birthDate.getMonth();

  // Total months = (years * 12) + months difference
  let totalMonths = years * 12 + months;

  // Adjust for day difference if reference day is before birthday day in the month
  if (referenceDate.getDate() < birthDate.getDate()) {
    totalMonths -= 1;
  }

  // Ensure non-negative age
  return Math.max(0, totalMonths);
};

/**
 * Calculate age in months from birthday (rounded up when there are remainder days).
 * This mirrors FormV3 behavior in registration flow:
 * - full months + 0 day remainder => keep value
 * - full months + 1+ day remainder => +1 month
 * @param birthday - Birthday in date-like string format
 * @param referenceDateInput - Optional reference date (default: now)
 * @returns Age in months (ceiling behavior)
 */
export const calculateAgeInMonthsCeiling = (
  birthday: string | undefined,
  referenceDateInput?: string | Date,
): number => {
  const birthDate = toValidDate(birthday);
  const referenceDate = toValidDate(referenceDateInput ?? new Date());

  if (!birthDate || !referenceDate) return 0;

  const floorMonths = calculateAgeInMonths(birthday, referenceDate);

  const monthAnchor = new Date(birthDate);
  monthAnchor.setMonth(monthAnchor.getMonth() + floorMonths);

  if (referenceDate.getTime() > monthAnchor.getTime()) {
    return floorMonths + 1;
  }

  return floorMonths;
};

/**
 * Format date for display in Thai format
 * @param dateString - Date string that can be parsed by Date constructor
 * @returns Formatted date string in DD/MM/YYYY format
 */
export const formatDateThai = (dateString: string | undefined): string => {
  if (!dateString) return "-";

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";

    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return "-";
  }
};
