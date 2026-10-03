/**
 * Equipment Resolver Utilities
 *
 * Centralised helpers so that MB003/MB004/MB005/MB041 equipment codes
 * are correctly classified alongside their legacy type strings (RMG, FBD, BLE, COAT).
 */

// ── Equipment code → type / display mapping ────────────────────────────────

const EQUIPMENT_MASTER: Record<
  string,
  {
    equipmentType: "RMG" | "FBD" | "BLE" | "COAT" | "COMP";
    equipmentName: string;
    make: string;
    plcModel: string;
    area: string;
    block: string;
    equipmentId: string;
  }
> = {
  MB003: {
    equipmentType: "RMG",
    equipmentName: "RAPID MIXER GRANULATOR",
    make: "BECTOCHEM",
    plcModel: "MITSUBISHI FX5U 32 MR",
    area: "GRANULATION",
    block: "PB1",
    equipmentId: "MB003",
  },
  MB004: {
    equipmentType: "FBD",
    equipmentName: "FLUID BED DRIER",
    make: "ALLIANCE",
    plcModel: "MITSUBISHI Fx5U 32 MR",
    area: "DRYING",
    block: "PB1",
    equipmentId: "MB004",
  },
  MB005: {
    equipmentType: "BLE",
    equipmentName: "OCTAGONAL BLENDER",
    make: "BECTOCHEM",
    plcModel: "MITSUBISHI Fx3U 32 MR",
    area: "BLENDING",
    block: "PB1",
    equipmentId: "MB005",
  },
  MB041: {
    equipmentType: "COAT",
    equipmentName: "AUTO COATER",
    make: "GANSONS",
    plcModel: "MITSUBISHI Fx3U 32 MR",
    area: "COATING",
    block: "PB1",
    equipmentId: "MB041",
  },
  MB040: {
    equipmentType: "COMP",
    equipmentName: "COMPRESSION MACHINE",
    make: "CADMACH",
    plcModel: "MITSUBISHI Fx5U 32 MR",
    area: "COMPRESSION",
    block: "PB1",
    equipmentId: "MB040",
  },
};

/** Resolve equipment type for a given equipment code (MB003, MB004 …) or legacy strings. */
export function resolveEquipmentType(code: string): "RMG" | "FBD" | "BLE" | "COAT" | "COMP" | null {
  const upper = (code || "").trim().toUpperCase();

  // Direct MB-code lookup first (most precise)
  if (EQUIPMENT_MASTER[upper]) {
    return EQUIPMENT_MASTER[upper].equipmentType;
  }

  // Fall back to substring matching for legacy codes
  if (upper.includes("RMG") || upper === "G5RMG" || upper === "RMGC0219") return "RMG";
  if (upper.includes("FBD") || upper === "G5FBD" || upper === "FBDC0220") return "FBD";
  if (
    upper.includes("BLE") ||
    upper.includes("OGB") ||
    upper.includes("OCB") ||
    upper === "G5BLE" ||
    upper === "OCBC0222"
  )
    return "BLE";
  if (
    upper.includes("COAT") ||
    upper.includes("COTC") ||
    upper === "G5COT" ||
    upper === "G5COAT" ||
    upper === "COATC0223" ||
    upper === "COTC0226"
  )
    return "COAT";
  if (upper.includes("COMP") || upper.includes("TAB") || upper === "MB040") return "COMP";

  return null;
}

/** Returns true if the equipment code refers to an RMG. */
export function isRmgCode(code: string): boolean {
  return resolveEquipmentType(code) === "RMG";
}
/** Returns true if the equipment code refers to an FBD. */
export function isFbdCode(code: string): boolean {
  return resolveEquipmentType(code) === "FBD";
}
/** Returns true if the equipment code refers to an Octagonal Blender. */
export function isBleCode(code: string): boolean {
  return resolveEquipmentType(code) === "BLE";
}
/** Returns true if the equipment code refers to an Auto Coater. */
export function isCoatCode(code: string): boolean {
  return resolveEquipmentType(code) === "COAT";
}
/** Returns true if the equipment code refers to a Compression Machine. */
export function isCompCode(code: string): boolean {
  return resolveEquipmentType(code) === "COMP";
}

/** Returns master data for a given equipment code, falling back to derived values. */
export function getEquipmentMasterInfo(code: string) {
  const upper = (code || "").trim().toUpperCase();
  if (EQUIPMENT_MASTER[upper]) return EQUIPMENT_MASTER[upper];

  // Derive from type
  const eqType = resolveEquipmentType(code);
  if (eqType === "FBD") {
    return { equipmentType: "FBD" as const, equipmentName: "FLUID BED DRIER", make: "ALLIANCE", plcModel: "—", area: "DRYING", block: "PB1", equipmentId: code };
  }
  if (eqType === "BLE") {
    return { equipmentType: "BLE" as const, equipmentName: "OCTAGONAL BLENDER", make: "BECTOCHEM", plcModel: "—", area: "BLENDING", block: "PB1", equipmentId: code };
  }
  if (eqType === "COAT") {
    return { equipmentType: "COAT" as const, equipmentName: "AUTO COATER", make: "GANSONS", plcModel: "—", area: "COATING", block: "PB1", equipmentId: code };
  }
  if (eqType === "COMP") {
    return { equipmentType: "COMP" as const, equipmentName: "COMPRESSION MACHINE", make: "CADMACH", plcModel: "—", area: "COMPRESSION", block: "PB1", equipmentId: code };
  }
  // Default: RMG
  return { equipmentType: "RMG" as const, equipmentName: "RAPID MIXER GRANULATOR", make: "BECTOCHEM", plcModel: "—", area: "GRANULATION", block: "PB1", equipmentId: code };
}
