import { describe, it, expect } from "vitest";
import { findOverlap } from "../src/lib/dates.js";

const items = [
  { id: "a", title: "수학", start: "08:20", end: "09:50" },
  { id: "b", title: "운동", start: "10:30", end: "11:00" },
];

describe("findOverlap", () => {
  it("시간이 걸치면 그 일정을 돌려준다", () => {
    expect(findOverlap(items, { start: "09:40", end: "10:10" }).id).toBe("a");
    expect(findOverlap(items, { start: "08:00", end: "12:00" }).id).toBe("a");
    expect(findOverlap(items, { start: "10:40", end: "10:50" }).id).toBe("b");
  });
  it("끝과 시작이 딱 붙는 것은 겹침이 아니다", () => {
    expect(findOverlap(items, { start: "09:50", end: "10:30" })).toBeNull();
    expect(findOverlap(items, { start: "07:00", end: "08:20" })).toBeNull();
  });
  it("수정 중인 일정 자신은 뺀다", () => {
    expect(findOverlap(items, { start: "08:30", end: "09:00" }, "a")).toBeNull();
    expect(findOverlap(items, { start: "08:30", end: "10:40" }, "a").id).toBe("b");
  });
});
