import { getActivationLaunchUrl } from "@/lib/pwa";

describe("PWA activation launch handling", () => {
  test("preserves a valid activation route and token", () => {
    expect(getActivationLaunchUrl(
      "https://ikasfutbase.cibermedida.es/activar?token=invitation-token",
      "https://ikasfutbase.cibermedida.es",
    )).toBe("/activar?token=invitation-token");
  });

  test("does not redirect normal, external, or tokenless launches", () => {
    const origin = "https://ikasfutbase.cibermedida.es";
    expect(getActivationLaunchUrl(`${origin}/login`, origin)).toBeNull();
    expect(getActivationLaunchUrl(`${origin}/activar`, origin)).toBeNull();
    expect(getActivationLaunchUrl("https://example.invalid/activar?token=x", origin)).toBeNull();
  });
});
