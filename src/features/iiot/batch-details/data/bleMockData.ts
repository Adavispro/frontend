// BLE Batch Mock Data single source of truth from Octagonal Blender Batch Report
export const BLE_BATCH_SUMMARY_MOCK = {
  batchNo: "NL0026008",
  lotNo: "01 of 05",
  equipmentId: "OCBC0222",
  equipmentName: "OCTAGONAL BLENDER",
  productName: "Finasteride USP 5 mg",
  productCode: "STFS7000",
  recipeName: "STFS7000",
  batchSize: "900.000 Kg",
  status: "COMPLETED",
  batchStartAt: "11/02/2026 09:04:55",
  batchEndAt: "11/02/2026 11:02:36",
  duration: "01:57:41",
  area: "BLENDER2",
  block: "PB3",
  operatorName: "25081 (PB3 OCBC0222 Operator)",
  supervisorName: "91525 (PB3 OCBC0222 Supervisor)",
};

export const BLE_ALARM_SUMMARY_MOCK: unknown[] = [];

const RAW_BLE_AUDIT_ROWS = [
  { dt: "11/02/2026 09:04:55", desc: "BATCH START", oldV: "-", newV: "-", reason: "-", user: "91525 (PB3 OCBC0222 Supervisor)", role: "PRODUCTION_SUPERVISOR" },
  { dt: "11/02/2026 09:08:04", desc: "CHARGE START", oldV: "-", newV: "-", reason: "-", user: "25081 (PB3 OCBC0222 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 10:15:13", desc: "CHARGE STOP", oldV: "-", newV: "-", reason: "-", user: "25081 (PB3 OCBC0222 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 10:20:52", desc: "BLEND START", oldV: "-", newV: "-", reason: "-", user: "25081 (PB3 OCBC0222 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 10:21:02", desc: "BLEND START", oldV: "-", newV: "-", reason: "-", user: "25081 (PB3 OCBC0222 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 10:47:54", desc: "CHARGE START", oldV: "-", newV: "-", reason: "-", user: "25081 (PB3 OCBC0222 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 10:52:03", desc: "CHARGE STOP", oldV: "-", newV: "-", reason: "-", user: "25081 (PB3 OCBC0222 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 10:54:12", desc: "BLEND START", oldV: "-", newV: "-", reason: "-", user: "25081 (PB3 OCBC0222 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 10:55:01", desc: "BLEND START", oldV: "-", newV: "-", reason: "-", user: "25081 (PB3 OCBC0222 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 11:02:36", desc: "BATCH END", oldV: "-", newV: "-", reason: "-", user: "91525 (PB3 OCBC0222 Supervisor)", role: "PRODUCTION_SUPERVISOR" },
];

export const BLE_AUDIT_TRAIL_MOCK = RAW_BLE_AUDIT_ROWS.map((row, idx) => {
  const num = String(idx + 1).padStart(2, "0");
  return {
    auditId: `AUD-BLE-${num}`,
    recordId: `AUD-BLE-${num}`,
    record_id: `AUD-BLE-${num}`,
    tenantId: "TNT-0001",
    batchNo: "NL0026008",
    lotNo: "1",
    equipmentCode: "OCBC0222",
    timestamp: row.dt,
    time_stamp: row.dt,
    dateTime: row.dt,
    dt: row.dt,
    action: row.desc,
    actionCode: row.desc,
    description: row.desc,
    previousStatus: row.oldV,
    newStatus: row.newV,
    oldValue: row.oldV,
    newValue: row.newV,
    old_value: row.oldV,
    new_value: row.newV,
    reason: row.reason,
    userId: row.user,
    userName: row.user,
    user_name: row.user,
    userRole: row.role,
    comments: row.reason,
    esignatureVerified: true,
    esignatureReason: row.reason === "-" ? "21 CFR Part 11 Process Audit Record" : row.reason,
    regulatoryStatement: "21 CFR Part 11 / EU Annex 11 compliant legally binding electronic signature.",
  };
});
