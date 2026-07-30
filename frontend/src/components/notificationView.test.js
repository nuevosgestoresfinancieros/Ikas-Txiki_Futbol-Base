import { notificationPreferenceKeys, priorityDotClass, unreadLabel } from "./notificationView";

test("notification preferences cover internal and optional email delivery", () => {
  expect(notificationPreferenceKeys).toEqual([
    "in_app", "email", "callups", "schedule_changes", "payments", "documents",
  ]);
});

test("unread badge is bounded and does not expose negative values", () => {
  expect(unreadLabel(3)).toBe("3");
  expect(unreadLabel(140)).toBe("99+");
  expect(unreadLabel(-2)).toBe("0");
});

test.each([
  ["urgent", "bg-red-500"],
  ["high", "bg-amber-500"],
  ["normal", "bg-[#2F7EBE]"],
])("notification priority %s has the expected accessible visual class", (priority, expected) => {
  expect(priorityDotClass(priority)).toBe(expected);
});
