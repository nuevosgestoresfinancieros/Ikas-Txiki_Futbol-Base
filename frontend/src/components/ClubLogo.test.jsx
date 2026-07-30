import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ClubLogo, { CLUB_LOGO_SRC } from "./ClubLogo";


test("uses the single official logo with the accessible corporate name", () => {
  const markup = renderToStaticMarkup(<ClubLogo className="h-10 w-10" />);
  expect(CLUB_LOGO_SRC).toBe("/brand/ikas-txiki-logo.png");
  expect(markup).toContain('alt="Ikas-Txiki Manager"');
  expect(markup).toContain('src="/brand/ikas-txiki-logo.png"');
  expect(markup).toContain("object-contain");
});


test("supports decorative repeated use without duplicating the source", () => {
  const markup = renderToStaticMarkup(<ClubLogo decorative loading="lazy" />);
  expect(markup).toContain('alt=""');
  expect(markup).toContain('loading="lazy"');
});
