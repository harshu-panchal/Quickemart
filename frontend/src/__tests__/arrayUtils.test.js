import { shuffleArray } from "../shared/utils/arrayUtils.js";

describe("shuffleArray", () => {
  it("should return an empty array if input is empty or null/undefined", () => {
    expect(shuffleArray([])).toEqual([]);
    expect(shuffleArray(null)).toEqual([]);
    expect(shuffleArray(undefined)).toEqual([]);
  });

  it("should return a new copy for single element array", () => {
    const input = [42];
    const output = shuffleArray(input);
    expect(output).toEqual([42]);
    expect(output).not.toBe(input);
  });

  it("should not mutate the input array", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffleArray(input);
    expect(input).toEqual(copy);
  });

  it("should contain the exact same elements after shuffling", () => {
    const input = ["apple", "banana", "cherry", "date", "elderberry"];
    const output = shuffleArray(input);

    expect(output).toHaveLength(input.length);
    expect(output.sort()).toEqual(input.sort());
  });

  it("should produce different permutations over multiple runs for reasonably sized arrays", () => {
    const input = Array.from({ length: 20 }, (_, i) => i + 1);
    const permutations = new Set();

    for (let i = 0; i < 10; i++) {
      permutations.add(shuffleArray(input).join(","));
    }

    // With 20 elements (20! permutations), 10 runs should produce multiple distinct orderings
    expect(permutations.size).toBeGreaterThan(1);
  });
});
