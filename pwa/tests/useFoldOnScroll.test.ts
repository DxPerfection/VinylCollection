import { describe, expect, it } from "vitest";

import { nextFolded } from "../src/lib/useFoldOnScroll";

describe("nextFolded", () => {
  it("stays open near the top", () => {
    expect(nextFolded(true, 20, 80)).toBe(false);
    expect(nextFolded(false, 30, 0)).toBe(false);
  });
  it("folds when scrolling down and opens when scrolling up", () => {
    expect(nextFolded(false, 200, 150)).toBe(true);
    expect(nextFolded(true, 180, 200)).toBe(false);
  });
  it("ignores tiny moves", () => {
    expect(nextFolded(true, 203, 200)).toBe(true);
    expect(nextFolded(false, 197, 200)).toBe(false);
  });
});
