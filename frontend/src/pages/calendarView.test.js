import { googleCalendarUrl, groupEventsByDate, monthDays, viewRange, weekDays } from "./calendarView";

test("month view always covers six complete weeks starting on Monday", () => {
  const days = monthDays(new Date(2026, 6, 17));
  expect(days).toHaveLength(42);
  expect(days[0].getDay()).toBe(1);
  expect(days[41].getDay()).toBe(0);
});

test("week and agenda ranges are deterministic", () => {
  const anchor = new Date(2026, 6, 17);
  expect(weekDays(anchor).map((day) => day.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
  expect(viewRange("week", anchor)).toEqual({ start: "2026-07-13", end: "2026-07-19" });
});

test("groups events without changing their source", () => {
  const events = [{ id: "match:1", fecha: "2026-07-17" }, { id: "training:2", fecha: "2026-07-17" }];
  expect(groupEventsByDate(events)["2026-07-17"]).toEqual(events);
});

test("google calendar link contains title, dates and location", () => {
  const url = googleCalendarUrl({ titulo: "Partido", fecha: "2026-07-17", hora: "10:00", hora_fin: "12:00", lugar: "Campo" });
  expect(url).toContain("calendar.google.com/calendar/render");
  expect(decodeURIComponent(url)).toContain("text=Partido");
  expect(decodeURIComponent(url)).toContain("location=Campo");
});
