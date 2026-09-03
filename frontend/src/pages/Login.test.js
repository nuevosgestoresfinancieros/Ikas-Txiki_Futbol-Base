import { destinationAfterLogin } from "./loginView";

test("sends a newly activated family to authorization onboarding", () => {
  expect(destinationAfterLogin({ role: "family" }, "?activated=1")).toBe("/portal?onboarding=1");
});

test("keeps ordinary family, player and staff destinations unchanged", () => {
  expect(destinationAfterLogin({ role: "family" }, "")).toBe("/portal");
  expect(destinationAfterLogin({ role: "player" }, "?activated=1")).toBe("/portal");
  expect(destinationAfterLogin({ role: "coach" }, "?activated=1", "/entrenamientos")).toBe("/entrenamientos");
});
