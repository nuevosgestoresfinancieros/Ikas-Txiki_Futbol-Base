export const notificationPreferenceKeys = [
  "in_app", "email", "callups", "schedule_changes", "payments", "documents",
];

export const unreadLabel = (count) => (count > 99 ? "99+" : String(Math.max(0, count || 0)));

export const priorityDotClass = (priority) => {
  if (priority === "urgent") return "bg-red-500";
  if (priority === "high") return "bg-amber-500";
  return "bg-teal-500";
};
