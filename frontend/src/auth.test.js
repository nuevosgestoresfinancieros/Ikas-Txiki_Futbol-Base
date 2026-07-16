import { can, ROUTE_RESOURCES } from "./auth";

describe("frontend permission helpers", () => {
  const user = {
    role: "coach",
    permissions: {
      dashboard: ["read"],
      trainings: ["read", "create", "edit"],
    },
  };

  test("allows an explicitly granted action", () => {
    expect(can(user, "trainings", "edit")).toBe(true);
  });

  test("denies missing resources and actions", () => {
    expect(can(user, "payments", "read")).toBe(false);
    expect(can(user, "trainings", "delete")).toBe(false);
  });

  test("maps every protected navigation route", () => {
    expect(ROUTE_RESOURCES["/usuarios"]).toBe("users");
    expect(ROUTE_RESOURCES["/autorizaciones"]).toBe("authorizations");
  });
});
