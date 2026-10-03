// COMP Batch Mock Data single source of truth from Pb1 Mb Compression report
export const COMP_BATCH_SUMMARY_MOCK = {
  batchNo: "Pb1 Mb Compression",
  lotNo: "01",
  equipmentId: "MB040",
  equipmentName: "COMPRESSION MACHINE",
  productName: "LAMOTRIGINE",
  productCode: "STGW2000",
  recipeName: "COMP",
  batchSize: "248.640 Kg",
  status: "COMPLETED",
  batchStartAt: "30/09/2026 01:00:00",
  batchEndAt: "30/09/2026 05:30:00",
  duration: "04:30:00",
  area: "MODULE-B",
  block: "PB1",
  operatorName: "10401 (PB1-Compression-Operator)",
  supervisorName: "10402 (PB1-Compression-Supervisor)",
};

export const COMP_USER_SESSIONS_MOCK = [
  { u: "10402 (PB1-Compression-Supervisor)", dt: "30/09/2026 01:00:00", act: "Login", isLog: true },
  { u: "10401 (PB1-Compression-Operator)", dt: "30/09/2026 01:05:00", act: "Login", isLog: true },
  { u: "10401 (PB1-Compression-Operator)", dt: "30/09/2026 05:25:00", act: "Logout Successfully", isLog: false },
  { u: "10402 (PB1-Compression-Supervisor)", dt: "30/09/2026 05:30:00", act: "Logout Successfully", isLog: false },
];

export const COMP_ALARM_SUMMARY_MOCK = [
  {
    alarmCode: "ALM-MB040-01",
    alarmName: "MAIN FORCE LIMIT HIGH",
    description: "MAIN FORCE LIMIT HIGH",
    occurredTime: "30/09/2026 02:15:00",
    occurred_time: "30/09/2026 02:15:00",
    resolvedTime: "30/09/2026 02:15:30",
    resolved_time: "30/09/2026 02:15:30",
    duration: "00:00:30",
    severity: "CRITICAL",
    equipmentId: "MB040",
    batchNo: "Pb1 Mb Compression",
    lotNo: "01",
    eventCategory: "ALARM",
  },
];

const RAW_COMP_AUDIT_ROWS = [
  { dt: "30/09/2026 01:00:00", desc: "BATCH START", oldV: "-", newV: "-", reason: "-", user: "10402 (PB1-Compression-Supervisor)", role: "PRODUCTION_SUPERVISOR" },
  { dt: "30/09/2026 01:05:00", desc: "COMPRESSION START", oldV: "-", newV: "-", reason: "-", user: "10401 (PB1-Compression-Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 02:15:00", desc: "MAIN FORCE PARAMETER ADJUST", oldV: "14.8", newV: "15.0", reason: "FORCE LIMIT CORRECTION", user: "10401 (PB1-Compression-Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 05:25:00", desc: "COMPRESSION STOP", oldV: "-", newV: "-", reason: "BATCH TARGET REACHED", user: "10401 (PB1-Compression-Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 05:30:00", desc: "BATCH END", oldV: "-", newV: "-", reason: "PROCESS OVER", user: "10402 (PB1-Compression-Supervisor)", role: "PRODUCTION_SUPERVISOR" },
];

export const COMP_AUDIT_TRAIL_MOCK = RAW_COMP_AUDIT_ROWS.map((row, idx) => {
  const num = String(idx + 1).padStart(2, "0");
  return {
    auditId: `AUD-MB040-${num}`,
    recordId: `AUD-MB040-${num}`,
    record_id: `AUD-MB040-${num}`,
    tenantId: "TNT-0001",
    batchNo: "Pb1 Mb Compression",
    lotNo: "01",
    equipmentCode: "MB040",
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
    esignatureReason: row.reason === "-" ? "Process Audit Record" : row.reason,
    regulatoryStatement: "Legally binding electronic signature.",
  };
});
