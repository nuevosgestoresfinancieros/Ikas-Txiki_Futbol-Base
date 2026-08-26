import { isStaleAssetError } from "@/lib/staleAssetRecovery";

describe("stale deployment asset recovery", () => {
  test("recognises lazy chunk failures that require a fresh application shell", () => {
    expect(isStaleAssetError(new Error("Loading chunk 58 failed."))).toBe(true);
    expect(isStaleAssetError(new Error("ChunkLoadError: Loading chunk 58 failed."))).toBe(true);
    expect(isStaleAssetError(new Error("Unexpected token '<'"))).toBe(true);
  });

  test("does not reload for an unrelated application failure", () => {
    expect(isStaleAssetError(new Error("Request failed with status code 403"))).toBe(false);
  });
});
