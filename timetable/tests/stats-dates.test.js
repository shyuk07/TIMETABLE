import { describe, it, expect } from "vitest";
import { dayBuckets, weekBuckets, monthBuckets, yearBuckets, barHeightPx, fixedMaxMins } from "../src/features/stats.js";
import { startOfWeek, weekdayLabels, toMin, normTime, fmtDuration, toDateStr, daysBetween, ddayLabel } from "../src/lib/dates.js";
import { monthHolidaySummary } from "../src/lib/holidays.js";

const NOW = new Date(2026, 10, 2, 14, 20); // 2026-11-02 월요일 14:20
const it_ = (date, start, end, categoryId = "c1") => ({ date, start, end, categoryId });

describe("dates", () => {
  it("startOfWeek: 일요일/월요일 시작", () => {
    expect(toDateStr(startOfWeek(NOW, 0))).toBe("2026-11-01");
    expect(toDateStr(startOfWeek(NOW, 1))).toBe("2026-11-02");
    expect(toDateStr(startOfWeek(new Date(2026, 10, 1), 1))).toBe("2026-10-26"); // 일요일은 월요일 시작 주의 마지막 날
  });
  it("weekdayLabels", () => {
    expect(weekdayLabels(0).join("")).toBe("일월화수목금토");
    expect(weekdayLabels(1).join("")).toBe("월화수목금토일");
  });
  it("시간 변환", () => {
    expect(toMin("09:30")).toBe(570);
    expect(toMin("09:30:00")).toBe(570);
    expect(normTime("09:30:00")).toBe("09:30");
    expect(fmtDuration(90)).toBe("1시간 30분");
    expect(fmtDuration(0)).toBe("0분");
  });
});

describe("stats buckets", () => {
  const all = [it_("2026-11-02", "09:30", "11:00"), it_("2026-11-02", "23:00", "23:30"), it_("2026-11-03", "10:00", "11:00"), it_("2026-12-01", "10:00", "10:30"), it_("2026-11-02", "10:00", "10:30", "c2")];
  it("일: 24칸, 시간 걸침 분배(9:30–11:00 → 9시 30분, 10시 60분)", () => {
    const b = dayBuckets(all, "c1", NOW);
    expect(b.length).toBe(24);
    expect(b[9].mins).toBe(30);
    expect(b[10].mins).toBe(60);
    expect(b[23].mins).toBe(30);
    expect(b.filter((x) => x.isNow).map((x) => x.full)).toEqual(["14시"]);
    expect(b.reduce((s, x) => s + x.mins, 0)).toBe(120);
    expect(b[3].label).toBe("3");
    expect(b[4].label).toBe("");
  });
  it("주: 일요일 시작이면 월요일은 두 번째 칸, 월요일 시작이면 첫 칸", () => {
    const sun = weekBuckets(all, "c1", 0, NOW);
    expect(sun.map((x) => x.label).join("")).toBe("일월화수목금토");
    expect(sun[1].mins).toBe(120);
    expect(sun[2].mins).toBe(60);
    expect(sun[1].isNow).toBe(true);
    const mon = weekBuckets(all, "c1", 1, NOW);
    expect(mon[0].mins).toBe(120);
    expect(mon[0].isNow).toBe(true);
  });
  it("월: 7일 단위, 카테고리 필터", () => {
    const b = monthBuckets(all, "c1", NOW);
    expect(b.map((x) => x.label)).toEqual(["1주", "2주", "3주", "4주", "5주"]);
    expect(b[0].mins).toBe(180); // 11/2(120) + 11/3(60)
    expect(b[0].isNow).toBe(true);
    expect(monthBuckets(all, "c2", NOW)[0].mins).toBe(30);
  });
  it("년: 12칸", () => {
    const b = yearBuckets(all, "c1", NOW);
    expect(b[10].mins).toBe(180);
    expect(b[11].mins).toBe(30);
    expect(b[10].isNow).toBe(true);
  });
  it("막대 높이는 고정 눈금 (24h / 월 168h), 최소 6px 최대 54px", () => {
    expect(fixedMaxMins("week")).toBe(1440);
    expect(fixedMaxMins("month")).toBe(10080);
    expect(barHeightPx(30, "day")).toBe(6);
    expect(barHeightPx(720, "week")).toBe(27);
    expect(barHeightPx(1440, "week")).toBe(54);
    expect(barHeightPx(99999, "week")).toBe(54);
    expect(barHeightPx(5040, "month")).toBe(27);
  });
});

describe("holidays", () => {
  it("공휴일 요약: 연속 같은 이름은 범위로", () => {
    expect(monthHolidaySummary(2026, 8)).toContain("9.24–26 추석");
    expect(monthHolidaySummary(2026, 9)).toContain("10.3 개천절");
  });
});

describe("디데이 계산", () => {
  it("daysBetween: 달·해를 넘어도 달력 날짜로 센다", () => {
    expect(daysBetween("2026-11-03", "2026-11-19")).toBe(16);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-03-01", "2026-02-28")).toBe(-1);
  });
  it("ddayLabel: D-n / D-Day / 지난 날은 그날을 1일째로 세는 D+n", () => {
    expect(ddayLabel("2026-11-19", "2026-11-03")).toBe("D-16");
    expect(ddayLabel("2026-11-03", "2026-11-03")).toBe("D-Day");
    expect(ddayLabel("2026-11-02", "2026-11-03")).toBe("D+2");
    expect(ddayLabel("2026-09-28", "2026-11-03")).toBe("D+37");
  });
});
