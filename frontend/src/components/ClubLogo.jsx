import React from "react";

export const CLUB_LOGO_SRC = "/brand/ikas-txiki-logo.png";

const ClubLogo = ({ className = "", loading = "eager", decorative = false }) => (
  <img
    src={CLUB_LOGO_SRC}
    alt={decorative ? "" : "Ikas-Txiki Manager"}
    loading={loading}
    decoding="async"
    className={`shrink-0 object-contain ${className}`}
  />
);

export default ClubLogo;
