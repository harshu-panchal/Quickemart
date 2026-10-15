/**
 * Shuffles an array using the Fisher-Yates (Knuth) algorithm without mutating the original array.
 *
 * @template T
 * @param {T[]} array - The array to shuffle.
 * @returns {T[]} A new array containing the elements in randomized order.
 */
export function shuffleArray(array) {
  if (!Array.isArray(array) || array.length <= 1) {
    return array ? [...array] : [];
  }

  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

export default shuffleArray;
