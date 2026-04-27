/**
 * Converts a flat lessonNo into "Modül X Ders Y" format.
 * @param {number} lessonNo - The sequential lesson number (1-based)
 * @param {number} moduleSize - Number of lessons per module (default 4)
 * @returns {string} e.g. "Modül 3 Ders 2"
 */
export function formatLessonLabel(lessonNo, moduleSize = 4) {
  if (!lessonNo) return 'Ders —'
  const ms = moduleSize || 4
  const moduleNo = Math.ceil(lessonNo / ms)
  const lessonInModule = ((lessonNo - 1) % ms) + 1
  return `Modül ${moduleNo} Ders ${lessonInModule}`
}
