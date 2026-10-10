import type { IiotAsset } from "@/features/master-management/iiot-master/api/types";
import type { BatchSummary, EquipmentLiveStatus } from "@/features/iiot/equipment/schemas/reports.schema";
import { scopeKey, type OeeEquipment, type OeeBatch } from "./oee-engine";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function buildOeeData(assets: IiotAsset[], statuses: EquipmentLiveStatus[], summaries: BatchSummary[]) {
  const equipment: OeeEquipment[] = assets.filter(a => a.isActive !== false).map(asset => {
    const code = (asset.equipmentCode || asset.equipmentId).trim().toUpperCase();
    const status = statuses.find(s => (s.equipmentId === code || s.equipmentId === asset.equipmentId)
      && (!s.tenantId || s.tenantId === asset.tenantId) && (!s.plantId || s.plantId === asset.plantId));
    return {
      id: scopeKey(asset.tenantId, asset.plantId, code), code,
      name: `${asset.equipmentName || code} (${code})`, status: status?.currentState || "Not reported",
      tenantId: asset.tenantId, plantId: asset.plantId,
      aliases: [code, asset.equipmentId.trim().toUpperCase()],
    };
  });
  const batches = new Map<string, OeeBatch>();
  let unmappedExecutions = 0;
  for (const summary of summaries) {
    const stages = summary.stages?.length ? summary.stages : [{
      equipmentCode: summary.equipmentId, stageStartAt: summary.batchStartAt,
      stageEndAt: summary.batchEndAt, approval: { status: summary.batchStatus || summary.overallStatus },
    }];
    for (const stage of stages) {
      if (!stage.stageStartAt && !stage.stageEndAt) continue;
      const code = text(stage.equipmentCode || stage.equipmentId).toUpperCase();
      const matching = equipment.filter(eq => eq.aliases?.includes(code)
        && (!summary.tenantId || summary.tenantId === eq.tenantId)
        && (!summary.plantId || summary.plantId === eq.plantId));
      if (matching.length !== 1 || !summary.batchNo) {
        unmappedExecutions++;
        continue;
      }
      const eq = matching[0];
      const lotNo = text(stage.derivedLotNo) || text(stage.lotNo) || summary.lotNo || "";
      const approval = text(stage.approval?.status).toUpperCase();
      // A workflow return/rejection is not evidence that the manufactured product failed QA.
      const outcome = text(stage.qualityOutcome || summary.qualityOutcome).toUpperCase();
      const status = outcome || (["APPROVED", "QA_APPROVED", "RELEASED"].includes(approval) ? approval : "UNKNOWN");
      const batch: OeeBatch = {
        batchNo: summary.batchNo, lotNo, equipmentId: eq.id, productCode: summary.productCode || "",
        status, startAt: stage.stageStartAt, endAt: stage.stageEndAt,
      };
      const key = `${eq.id}|${batch.batchNo}|${lotNo}|${batch.startAt || ""}|${batch.endAt || ""}`;
      const previous = batches.get(key);
      if (!previous || previous.status === "UNKNOWN") batches.set(key, batch);
    }
  }
  return { equipment: Array.from(new Map(equipment.map(eq => [eq.id, eq])).values()).sort((a, b) => a.name.localeCompare(b.name)),
    batches: Array.from(batches.values()), unmappedExecutions };
}
