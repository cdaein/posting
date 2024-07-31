import { describe, it, expect } from "vitest";
import { isOutsideMinutes, isWithinMinutes } from "../src/utils";

describe("isOutsideMinutes", () => {
  it("should return true when target is in the future and outside positive threshold", () => {
    const tgt = new Date(2024, 7, 10, 10, 50);
    const cur = new Date(2024, 7, 10, 10, 20);
    expect(isOutsideMinutes(tgt, cur, 10)).toBe(true); // true. looking into the future and it is outside window.
  });

  it("should return false when target is in the future and use negative threshold", () => {
    const tgt = new Date(2024, 7, 10, 10, 50);
    const cur = new Date(2024, 7, 10, 10, 20);
    expect(isOutsideMinutes(tgt, cur, -10)).toBe(false); // false. only look into the future. threshold is negative so it doesn't count.
  });

  it("should return false when target is in the future and within positive threhosld", () => {
    const tgt = new Date(2024, 7, 10, 10, 50);
    const cur = new Date(2024, 7, 10, 10, 20);
    expect(isOutsideMinutes(tgt, cur, 60)).toBe(false); // false. tgt is within window.
  });

  it("should return false when target is in the future and use negative threshold", () => {
    const tgt = new Date(2024, 7, 10, 10, 50);
    const cur = new Date(2024, 7, 10, 10, 20);
    expect(isOutsideMinutes(tgt, cur, -60)).toBe(false); // false. threshold is negative so it doesn't count when tgt is in future.
  });

  it("should return true when target is in the past and outside negative threshold", () => {
    const tgt = new Date(2024, 7, 10, 10, 10);
    const cur = new Date(2024, 7, 10, 10, 40);
    expect(isOutsideMinutes(tgt, cur, -10)).toBe(true); // true. looking back into past and it is outside window.
  });

  it("should return false when target is in the past and use positive threshold", () => {
    const tgt = new Date(2024, 7, 10, 10, 10);
    const cur = new Date(2024, 7, 10, 10, 40);
    expect(isOutsideMinutes(tgt, cur, 10)).toBe(false); // false. only look back. threshold is positive so it doesn't count.
  });

  it("should return false when target is in the past and within negative threshold", () => {
    const tgt = new Date(2024, 7, 10, 10, 10);
    const cur = new Date(2024, 7, 10, 10, 40);
    expect(isOutsideMinutes(tgt, cur, -60)).toBe(false); // false. tgt is within window.
  });

  it("should return false when target is in the past and use positive threshold", () => {
    const tgt = new Date(2024, 7, 10, 10, 10);
    const cur = new Date(2024, 7, 10, 10, 40);
    expect(isOutsideMinutes(tgt, cur, 60)).toBe(false); // false. looking at future doesn't count.
  });
});

describe("isWithinMinutes", () => {
  it("should return false when target time is in the past and threshold is positive", () => {
    const targetTime = new Date(2025, 7, 10, 10, 15);
    const currentTime = new Date(2025, 7, 10, 10, 22);
    expect(isWithinMinutes(targetTime, currentTime, 10)).toBe(false);
  });

  it("should return true when target time is in the past and threshold is negative", () => {
    const targetTime = new Date(2025, 7, 10, 10, 15);
    const currentTime = new Date(2025, 7, 10, 10, 22);
    expect(isWithinMinutes(targetTime, currentTime, -10)).toBe(true);
  });

  it("should return true when target time is in the future and threshold is positive", () => {
    const targetTime = new Date(2025, 7, 10, 10, 22);
    const currentTime = new Date(2025, 7, 10, 10, 15);
    expect(isWithinMinutes(targetTime, currentTime, 10)).toBe(true);
  });

  it("should return false when target time is in the future and threshold is negative", () => {
    const targetTime = new Date(2025, 7, 10, 10, 22);
    const currentTime = new Date(2025, 7, 10, 10, 15);
    expect(isWithinMinutes(targetTime, currentTime, -10)).toBe(false);
  });

  it("should return true when target time is within the threshold", () => {
    const targetTime = new Date(2025, 7, 10, 10, 20);
    const currentTime = new Date(2025, 7, 10, 10, 15);
    expect(isWithinMinutes(targetTime, currentTime, 5)).toBe(true);
  });

  it("should return true when target time is within the threshold (to the past)", () => {
    const targetTime = new Date(2025, 7, 10, 10, 15);
    const currentTime = new Date(2025, 7, 10, 10, 20);
    expect(isWithinMinutes(targetTime, currentTime, -5)).toBe(true);
  });

  it("should return false when target time is outside the threshold", () => {
    const targetTime = new Date(2025, 7, 10, 10, 30);
    const currentTime = new Date(2025, 7, 10, 10, 15);
    expect(isWithinMinutes(targetTime, currentTime, 10)).toBe(false);
  });

  it("should return false when target time is outside the threshold (to the past)", () => {
    const targetTime = new Date(2025, 7, 10, 10, 15);
    const currentTime = new Date(2025, 7, 10, 10, 30);
    expect(isWithinMinutes(targetTime, currentTime, -10)).toBe(false);
  });
});
