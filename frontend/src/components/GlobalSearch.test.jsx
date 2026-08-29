import fs from "fs";
import path from "path";

test("global search supports explicit submit, keyboard navigation, and visible errors", () => {
  const source = fs.readFileSync(path.join(__dirname, "GlobalSearch.jsx"), "utf8");
  expect(source).toContain('data-testid="global-search-submit"');
  expect(source).toContain('event.key === "ArrowDown"');
  expect(source).toContain('event.key === "ArrowUp"');
  expect(source).toContain('event.key === "Enter"');
  expect(source).toContain('data-testid="search-error"');
});

test("global search only renders the supported safe result groups", () => {
  const source = fs.readFileSync(path.join(__dirname, "GlobalSearch.jsx"), "utf8");
  expect(source).toContain('const TYPE_ORDER = ["player", "family", "team"]');
  expect(source).not.toContain('payment:');
  expect(source).not.toContain('inscription:');
});
