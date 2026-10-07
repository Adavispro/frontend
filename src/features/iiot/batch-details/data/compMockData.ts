// COMP (Compression Machine) Mock Data single source of truth for Tablet Press
export const COMP_BATCH_SUMMARY_MOCK = {
  batchNo: "AGO0026016",
  lotNo: "01",
  equipmentId: "MB040",
  equipmentName: "ROTARY TABLET PRESS (COMPRESSION)",
  productName: "Lamotrigine Tablets USP 100 mg",
  productCode: "STGW2000",
  recipeName: "STGW2000",
  batchSize: "900.000 Kg",
  status: "IN_PROGRESS",
  batchStartAt: "11/02/2026 14:15:00",
  batchEndAt: "11/02/2026 18:45:20",
  duration: "04:30:20",
  area: "COMPRESSION",
  block: "PB1",
  operatorName: "10401 (PB1-Compression-Operator)",
  supervisorName: "10402 (PB1-Compression-Supervisor)",
};

export const COMP_ALARM_SUMMARY_MOCK = [
  {
    alarmCode: "ALM-401",
    alarmName: "MAIN COMPRESSION FORCE HIGH",
    description: "Main Compression Force exceeded 28.0 kN upper warning threshold",
    occurredTime: "11/02/2026 15:30:10",
    occurred_time: "11/02/2026 15:30:10",
    resolvedTime: "11/02/2026 15:30:45",
    resolved_time: "11/02/2026 15:30:45",
    duration: "00:00:35",
    severity: "WARNING",
    equipmentId: "MB040",
    batchNo: "AGO0026016",
    lotNo: "01",
    eventCategory: "ALARM",
  },
  {
    alarmCode: "ALM-402",
    alarmName: "FEEDER SPEED OUT OF TOLERANCE",
    description: "Feeder Speed dropped below 20.0 RPM minimum operational limit",
    occurredTime: "11/02/2026 16:12:00",
    occurred_time: "11/02/2026 16:12:00",
    resolvedTime: "11/02/2026 16:12:18",
    resolved_time: "11/02/2026 16:12:18",
    duration: "00:00:18",
    severity: "CRITICAL",
    equipmentId: "MB040",
    batchNo: "AGO0026016",
    lotNo: "01",
    eventCategory: "ALARM",
  },
];

const RAW_COMP_AUDIT_ROWS = [
  { dt: "11/02/2026 14:15:00", desc: "BATCH START", oldV: "-", newV: "-", reason: "-", user: "10402 (PB1 MB040 Supervisor)", role: "PRODUCTION_SUPERVISOR" },
  { dt: "11/02/2026 14:18:22", desc: "TOOLING INSPECTION COMPLETED", oldV: "-", newV: "PASSED", reason: "PRE-RUN CHECKS", user: "10401 (PB1 MB040 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 14:25:00", desc: "FEEDER START", oldV: "-", newV: "28.0 RPM", reason: "-", user: "10401 (PB1 MB040 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 14:30:10", desc: "TURRET ROTATION START", oldV: "-", newV: "35.0 RPM", reason: "-", user: "10401 (PB1 MB040 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 15:00:00", desc: "IN-PROCESS WEIGHT SAMPLING", oldV: "248.5 mg", newV: "250.2 mg", reason: "HOURLY IPC", user: "10401 (PB1 MB040 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 16:00:00", desc: "IN-PROCESS HARDNESS CHECK", oldV: "88.0 N", newV: "91.5 N", reason: "HOURLY IPC", user: "10401 (PB1 MB040 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 18:40:00", desc: "COMPRESSION RUN COMPLETE", oldV: "-", newV: "-", reason: "BATCH TARGET REACHED", user: "10401 (PB1 MB040 Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "11/02/2026 18:45:20", desc: "BATCH END", oldV: "-", newV: "-", reason: "-", user: "10402 (PB1 MB040 Supervisor)", role: "PRODUCTION_SUPERVISOR" },
];

export const COMP_AUDIT_TRAIL_MOCK = RAW_COMP_AUDIT_ROWS.map((row, idx) => {
  const num = String(idx + 1).padStart(2, "0");
  return {
    auditId: `AUD-COMP-${num}`,
    recordId: `AUD-COMP-${num}`,
    timestamp: row.dt,
    eventTime: row.dt,
    description: row.desc,
    action: row.desc,
    actionCode: row.desc,
    oldValue: row.oldV,
    old_value: row.oldV,
    newValue: row.newV,
    new_value: row.newV,
    reason: row.reason,
    esignatureReason: row.reason,
    userId: row.user,
    userName: row.user,
    user_name: row.user,
    role: row.role,
    equipmentId: "MB040",
    equipmentCode: "MB040",
    category: "AUDIT",
  };
});
