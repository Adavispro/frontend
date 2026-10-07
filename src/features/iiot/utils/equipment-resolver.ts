export type EquipmentTypeCode = "RMG" | "FBD" | "BLE" | "COMP" | "COAT" | "CIP" | "GENERIC";

export interface EquipmentMeta {
  type: EquipmentTypeCode;
  code: string;
  name: string;
  make: string;
  area: string;
  block: string;
  defaultRecipe: string;
}

/**
 * Resolves equipment metadata, display names, makes, areas, and equipment type
 * from canonical equipment identifiers (MB003, MB004, MB005, MB040, MB041)
 * or legacy tags (G5RMG, FBDC0220, RMG, FBD, BLE, COMP, COAT, CIP).
 */
export function resolveEquipmentInfo(codeOrType: string = ""): EquipmentMeta {
  const norm = (codeOrType || "").trim().toUpperCase();

  // 1. RAPID MIXER GRANULATOR (MB003)
  if (
    norm === "MB003" ||
    norm.includes("RMG") ||
    norm === "RMGC0219" ||
    norm === "G5RMG" ||
    norm.includes("GRANULAT")
  ) {
    return {
      type: "RMG",
      code: norm === "MB003" ? "MB003" : norm || "MB003",
      name: "RAPID MIXER GRANULATOR",
      make: "BECTOCHEM",
      area: "MODULE-B",
      block: "PB1",
      defaultRecipe: "STGW2000",
    };
  }

  // 2. FLUID BED DRIER (MB004)
  if (
    norm === "MB004" ||
    norm.includes("FBD") ||
    norm === "FBDC0220" ||
    norm === "G5FBD" ||
    norm.includes("DRIER") ||
    norm.includes("DRYER")
  ) {
    return {
      type: "FBD",
      code: norm === "MB004" ? "MB004" : norm || "MB004",
      name: "FLUID BED DRIER",
      make: "ALLIANCE",
      area: "MODULE-B",
      block: "PB1",
      defaultRecipe: "STGW2000",
    };
  }

  // 3. OCTAGONAL BLENDER (MB005)
  if (
    norm === "MB005" ||
    norm.includes("BLE") ||
    norm.includes("OGB") ||
    norm.includes("OCB") ||
    norm === "OCBC0222" ||
    norm === "G5OGB" ||
    norm === "G5BLE" ||
    norm.includes("BLEND")
  ) {
    return {
      type: "BLE",
      code: norm === "MB005" ? "MB005" : norm || "MB005",
      name: "OCTAGONAL BLENDER",
      make: "BECTOCHEM",
      area: "MODULE B",
      block: "PB1",
      defaultRecipe: "STGW2000",
    };
  }

  // 4. ROTARY TABLET PRESS / COMPRESSION (MB040)
  if (
    norm === "MB040" ||
    norm.includes("COMP") ||
    norm.includes("TAB") ||
    norm === "TABC0225" ||
    norm === "G5COMP" ||
    norm.includes("PRESS")
  ) {
    return {
      type: "COMP",
      code: norm === "MB040" ? "MB040" : norm || "MB040",
      name: "ROTARY TABLET PRESS (COMPRESSION)",
      make: "SEJONG PHARMATECH",
      area: "MODULE-B",
      block: "PB1",
      defaultRecipe: "STGW2000",
    };
  }

  // 5. AUTO COATER (MB041)
  if (
    norm === "MB041" ||
    norm.includes("COAT") ||
    norm.includes("COTC") ||
    norm === "COATC0223" ||
    norm === "COTC0226" ||
    norm === "G5COAT" ||
    norm === "G5COT"
  ) {
    return {
      type: "COAT",
      code: norm === "MB041" ? "MB041" : norm || "MB041",
      name: "AUTO COATER",
      make: "GANSONS",
      area: "COATING MODULE-B",
      block: "PB1",
      defaultRecipe: "STPA1D00",
    };
  }

  // 6. CIP SYSTEM
  if (norm.includes("CIP")) {
    return {
      type: "CIP",
      code: norm || "CIP-01",
      name: "CLEAN IN PLACE SYSTEM",
      make: "CIP SYSTEMS",
      area: "WASHING",
      block: "PB1",
      defaultRecipe: "CIP-STD",
    };
  }

  // Fallback Generic Equipment
  return {
    type: "GENERIC",
    code: norm || "EQUIPMENT",
    name: norm ? `EQUIPMENT (${norm})` : "EQUIPMENT",
    make: "PHARMA TECH",
    area: "PRODUCTION",
    block: "PB1",
    defaultRecipe: "STGW2000",
  };
}
