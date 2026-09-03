const FAMILY_PARENT_SLOTS = [1, 2];

/**
 * Builds the parent choices for one player's family without exposing account
 * credentials or using a free-form signer name. The family record is already
 * scoped by the API for the current administrator/coordinator.
 */
export const familyParentOptions = (families = [], players = [], playerId) => {
  const player = players.find((item) => item.id === playerId);
  const family = families.find((item) => item.id === player?.familia_id);
  if (!family) return [];
  return FAMILY_PARENT_SLOTS.map((slot) => {
    const name = String(family[`progenitor${slot}_nombre`] || "").trim();
    const email = String(family[`progenitor${slot}_email`] || "").trim();
    return {
      slot,
      name: name || `Progenitor/a ${slot}`,
      hasData: Boolean(name || email),
    };
  }).filter((parent) => parent.hasData).map(({ hasData, ...parent }) => parent);
};

export const selectedFamilyParentSlot = (options = [], selectedSlot) => {
  const selected = Number(selectedSlot);
  return options.some((parent) => parent.slot === selected) ? selected : options[0]?.slot;
};
