// FBD Batch Mock Data single source of truth from PB1FBD(MODULE-B)_FBD_BATCH_REPORT_20260930_100409.pdf
export const FBD_BATCH_SUMMARY_MOCK = {
  batchNo: "AGO0026016",
  lotNo: "1B",
  equipmentId: "MB004",
  equipmentName: "FLUID BED DRIER",
  productName: "LAMOTRIGINE",
  productCode: "STGW2000",
  recipeName: "AGO",
  batchSize: "248.640 Kg",
  status: "COMPLETED",
  batchStartAt: "30/09/2026 05:34:49",
  batchEndAt: "30/09/2026 07:46:43",
  duration: "02:11:54",
  area: "MODULE-B",
  block: "PB1",
  operatorName: "11173 (PB1-Module-B (MB004) Operator)",
  supervisorName: "191555 (PB1-Module-B (MB004) Supervisor)",
};

export const FBD_USER_SESSIONS_MOCK = [
  { u: "191555 (PB1-Module-B (MB004) Supervisor)", dt: "30/09/2026 05:34:55", act: "Logout Sucessfully", isLog: false },
  { u: "11173 (PB1-Module-B (MB004) Operator)", dt: "30/09/2026 05:44:24", act: "Login", isLog: true },
  { u: "11173 (PB1-Module-B (MB004) Operator)", dt: "30/09/2026 05:57:02", act: "Logout Sucessfully", isLog: false },
  { u: "11375 (PB1-Module-B (MB004) Operator)", dt: "30/09/2026 05:57:22", act: "Login", isLog: true },
  { u: "11375 (PB1-Module-B (MB004) Operator)", dt: "30/09/2026 06:12:25", act: "Session Timeout", isLog: false },
  { u: "11375 (PB1-Module-B (MB004) Operator)", dt: "30/09/2026 06:14:10", act: "Login", isLog: true },
  { u: "11375 (PB1-Module-B (MB004) Operator)", dt: "30/09/2026 07:41:10", act: "Logout Sucessfully", isLog: false },
  { u: "191164 (PB1-Module-B (MB004) Supervisor)", dt: "30/09/2026 07:46:35", act: "Login", isLog: true },
];

export const FBD_ALARM_SUMMARY_MOCK: unknown[] = [];

const RAW_FBD_AUDIT_ROWS = [
  { dt: "30/09/2026 05:34:49", desc: "BATCH START", oldV: "-", newV: "-", reason: "-", user: "191555 (PB1-Module-B (MB004) Supervisor)", role: "PRODUCTION_SUPERVISOR" },
  { dt: "30/09/2026 05:44:26", desc: "SELECT MODE AUTO", oldV: "-", newV: "-", reason: "-", user: "11173 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 05:44:31", desc: "PC SEAL ON", oldV: "-", newV: "-", reason: "-", user: "11173 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 05:45:11", desc: "AUTO START", oldV: "-", newV: "-", reason: "-", user: "11173 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 05:50:16", desc: "AUTO STOP", oldV: "-", newV: "-", reason: "RAKING", user: "11173 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 05:52:07", desc: "PC SEAL OFF", oldV: "-", newV: "-", reason: "-", user: "11173 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 06:25:06", desc: "PC SEAL ON", oldV: "-", newV: "-", reason: "-", user: "11375 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 06:25:15", desc: "AUTO START", oldV: "-", newV: "-", reason: "-", user: "11375 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 06:34:08", desc: "AUTO STOP", oldV: "-", newV: "-", reason: "LOD CHECK", user: "11375 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 06:36:03", desc: "PC SEAL OFF", oldV: "-", newV: "-", reason: "-", user: "11375 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 07:00:28", desc: "PC SEAL ON", oldV: "-", newV: "-", reason: "-", user: "11375 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 07:00:39", desc: "AUTO START", oldV: "-", newV: "-", reason: "-", user: "11375 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 07:09:00", desc: "AUTO STOP", oldV: "-", newV: "-", reason: "LOD CHECK", user: "11375 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 07:11:31", desc: "PC SEAL OFF", oldV: "-", newV: "-", reason: "-", user: "11375 (PB1-Module-B (MB004) Operator)", role: "PRODUCTION_OPERATOR" },
  { dt: "30/09/2026 07:46:43", desc: "BATCH END", oldV: "-", newV: "-", reason: "-", user: "191164 (PB1-Module-B (MB004) Supervisor)", role: "PRODUCTION_SUPERVISOR" },
];

export const FBD_AUDIT_TRAIL_MOCK = RAW_FBD_AUDIT_ROWS.map((row, idx) => {
  const num = String(idx + 1).padStart(2, "0");
  return {
    auditId: `AUD-MB004-${num}`,
    recordId: `AUD-MB004-${num}`,
    record_id: `AUD-MB004-${num}`,
    tenantId: "TNT-0001",
    batchNo: "AGO0026016",
    lotNo: "1B",
    equipmentCode: "MB004",
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
