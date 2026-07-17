const iso = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, amount) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
};

export const monthDays = (anchor) => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};

export const weekDays = (anchor) => {
  const offset = (anchor.getDay() + 6) % 7;
  const start = addDays(anchor, -offset);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
};

export const viewRange = (view, anchor) => {
  const days = view === "month" ? monthDays(anchor) : view === "week" ? weekDays(anchor) : [addDays(anchor, -30), addDays(anchor, 120)];
  return { start: iso(days[0]), end: iso(days[days.length - 1]) };
};

export const groupEventsByDate = (events) => events.reduce((groups, event) => {
  (groups[event.fecha] ||= []).push(event);
  return groups;
}, {});

const compact = (value) => String(value || "").replace(/[-:]/g, "").slice(0, 15);

export const googleCalendarUrl = (event) => {
  const start = compact(`${event.fecha}T${event.hora || "00:00"}:00`);
  const end = compact(`${event.fecha_fin || event.fecha}T${event.hora_fin || event.hora || "01:00"}:00`);
  const query = new URLSearchParams({ action: "TEMPLATE", text: event.titulo || "Ikas-Txiki", dates: `${start}/${end}` });
  if (event.descripcion) query.set("details", event.descripcion);
  if (event.lugar) query.set("location", event.lugar);
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
};

export const isoDay = iso;
