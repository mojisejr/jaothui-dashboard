/**
 * Calculate age in months from a birthday string
 * @param birthday - Birthday string in format that can be parsed by Date constructor
 * @returns Age in months (rounded down)
 */
export const calculateAgeInMonths = (birthday: string | undefined): number => {
  if (!birthday) return 0;

  try {
    const birthDate = new Date(birthday);
    const today = new Date();
    
    // Check if the date is valid
    if (isNaN(birthDate.getTime())) {
      console.warn("Invalid birthday date:", birthday);
      return 0;
    }

    const years = today.getFullYear() - birthDate.getFullYear();
    const months = today.getMonth() - birthDate.getMonth();
    
    // Total months = (years * 12) + months difference
    let totalMonths = years * 12 + months;
    
    // Adjust for day difference if current day is before birthday day in the month
    if (today.getDate() < birthDate.getDate()) {
      totalMonths -= 1;
    }
    
    // Ensure we don't return negative age
    return Math.max(0, totalMonths);
  } catch (error) {
    console.error("Error calculating age:", error);
    return 0;
  }
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
