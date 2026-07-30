import { passwordChecks } from "./userAdministrationView";

describe("user security phase 2", () => {
  test("temporary and replacement passwords use the same visible requirements", () => {
    expect(Object.values(passwordChecks("Secure-Fictitious-2026!"))).not.toContain(false);
    expect(Object.values(passwordChecks("weak"))).toContain(false);
  });

  test("phase 2 translations exist in Spanish and Basque source", () => {
    const fs = require("fs");
    const source = fs.readFileSync(require.resolve("../i18n"), "utf8");
    expect((source.match(/generateTemporaryPassword:/g) || [])).toHaveLength(2);
    expect((source.match(/closeSessions:/g) || [])).toHaveLength(2);
    expect((source.match(/shownOnlyOnce:/g) || [])).toHaveLength(2);
  });
});
