import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider, can, PermissionGate, ROUTE_RESOURCES } from "./auth";

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

  test("does not render an action missing from backend-provided permissions", () => {
    const html = renderToStaticMarkup(
      <AuthProvider user={user}>
        <PermissionGate resource="players" action="delete"><button>Eliminar</button></PermissionGate>
        <PermissionGate resource="trainings" action="edit"><button>Editar</button></PermissionGate>
      </AuthProvider>,
    );
    expect(html).not.toContain("Eliminar");
    expect(html).toContain("Editar");
  });
});
