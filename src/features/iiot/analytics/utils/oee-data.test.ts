import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOeeData } from "./oee-data";
import type { IiotAsset } from "@/features/master-management/iiot-master/api/types";
import type { BatchSummary } from "@/features/iiot/equipment/schemas/reports.schema";

const asset: IiotAsset = {
  equipmentId: "EQ001", equipmentCode: "MC081", equipmentName: "Compression",
  tenantId: "T1", plantId: "P1", areaId: "A1", roomId: "R1", isActive: true,
};
const summary: BatchSummary = {
  tenantId: "T1", plantId: "P1", batchNo: "B1", lotNo: "Lot-01", productCode: "PROD",
  overallStatus: "COMPLETED", stages: [
    { equipmentCode: "MC081", stageStartAt: "2026-10-01T06:00:00Z", stageEndAt: "2026-10-01T07:00:00Z",
      approval: { status: "APPROVED" } },
    { equipmentCode: "G5FBD", executionStatus: "NOT_STARTED" },
  ],
};

test("maps real equipment scopes, stage durations, and distinct lots without demo data", () => {
  const result = buildOeeData([asset], [{ equipmentId: "MC081", currentState: "IDLE" }], [summary, { ...summary, lotNo: "Lot-02" }]);
  assert.equal(result.equipment[0].code, "MC081");
  assert.equal(result.equipment[0].status, "IDLE");
  assert.equal(result.batches.length, 2);
  assert.equal(result.batches[0].status, "APPROVED");
  assert.equal(result.unmappedExecutions, 0);
});

test("deduplicates replayed executions and does not treat workflow returns as failed product", () => {
  const returned: BatchSummary = { ...summary, stages: [{ ...summary.stages![0], approval: { status: "REJECTED" } }] };
  const result = buildOeeData([asset], [], [returned, summary, summary]);
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].status, "APPROVED");
  assert.equal(buildOeeData([asset], [], [returned]).batches[0].status, "UNKNOWN");
});

test("ambiguous legacy scopes are reported, not attributed to a guessed tenant", () => {
  const result = buildOeeData([asset, { ...asset, tenantId: "T2" }], [], [{ ...summary, tenantId: undefined }]);
  assert.equal(result.batches.length, 0);
  assert.equal(result.unmappedExecutions, 1);
});

test("explicit manufacturing quality outcomes and missing outcomes are distinguished", () => {
  const failed = buildOeeData([asset], [], [{ ...summary, qualityOutcome: "FAILED" }]);
  assert.equal(failed.batches[0].status, "FAILED");
  const pending = buildOeeData([asset], [], [{ ...summary, stages: [{ ...summary.stages![0], approval: { status: "PENDING" } }] }]);
  assert.equal(pending.batches[0].status, "UNKNOWN");
});
