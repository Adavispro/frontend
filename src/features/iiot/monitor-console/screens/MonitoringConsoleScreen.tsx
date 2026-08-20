"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { SidePanel, Snackbar } from "@/components/ui";
import { getTopologyRecords } from "@/features/master-management/plant-topology/api/topology.api";
import {
  getAlarmEventData,
  getBatchSummaryPaginated,
  getCppData,
  getCppDataPaginated,
  getEquipmentLiveStatus,
  getEquipmentLiveStatuses,
} from "@/features/iiot/equipment/api/reports.api";
import {
  normalizeAlarmRows,
  normalizeBatchSummary,
  normalizeCppToParameterRows,
  normalizeEventRows,
} from "@/features/iiot/equipment/data/report-normalizers";
import type {
  AlarmRow,
  EventRow,
  ParameterRow,
} from "@/features/iiot/equipment/data/types";
import type {
  BatchSummary,
  EquipmentLiveStatus,
} from "@/features/iiot/equipment/schemas/reports.schema";
import type { Area, Plant } from "@/features/master-management/shared/schemas";
import MonitoringDashboard from "../components/MonitoringDashboard";
import MonitoringFormCard from "../components/MonitoringFormCard";
import WaitingStateCard from "../components/WaitingStateCard";
import {
  getInitialMonitoringValues,
  isCompleteMonitoringSelection,
  monitoringFields,
} from "../data/data";
import type {
  MonitoringField,
  MonitoringOption,
  MonitoringValues,
} from "../data/types";
import {
  clearTopBarSelection,
  setTopBarSelection,
} from "@/utils/topBarSelection";

interface MasterFilterData {
  plants: Plant[];
  areas: Area[];
}

const emptyMasterFilterData: MasterFilterData = {
  plants: [],
  areas: [],
};

const text = (value: unknown) => String(value ?? "").trim();

const lotFromCppRecord = (record: Record<string, unknown>) => {
  const directLot = text(record.lotNo);
  if (directLot) return directLot;

  const meta = record.meta;
  if (meta && typeof meta === "object") {
    const metaRecord = meta as Record<string, unknown>;
    const metaLot = text(metaRecord.lotNo);
    if (metaLot) return metaLot;
  }

  return "";
};

const parseDateTime = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
};

const toOptions = (items: MonitoringOption[]) => {
  const unique = new Map<string, MonitoringOption>();
  items.forEach((item) => {
    if (!item.value) return;
    if (!unique.has(item.value)) {
      unique.set(item.value, item);
    }
  });
  return Array.from(unique.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );
};

const equipmentLabel = (status: EquipmentLiveStatus) => {
  const id = text(status.equipmentId);
  const raw = (status as unknown as Record<string, unknown>).equipmentName;
  const name = text(raw);
  return name ? `${name} (${id})` : id;
};

const buildMonitoringFields = (
  values: MonitoringValues,
  statuses: EquipmentLiveStatus[],
  summaries: BatchSummary[],
  masterData: MasterFilterData,
  cppLots: string[],
  isLotOptionsLoading: boolean,
): MonitoringField[] => {
  const plantOptions = toOptions(
    masterData.plants
      .filter((plant) => plant.isActive)
      .map((plant) => ({
        value: plant.plantId,
        label: plant.plantName?.trim() || plant.plantId,
      })),
  );
  const areaOptions = toOptions(
    masterData.areas
      .filter(
        (area) =>
          area.isActive &&
          (!values.plantId || area.plantId === values.plantId),
      )
      .map((area) => ({
        value: area.areaId,
        label: area.areaName?.trim() || area.areaId,
      })),
  );

  const scopedStatuses = statuses.filter(
    (status) =>
      (!values.plantId || text(status.plantId) === values.plantId) &&
      (!values.areaId || text(status.areaId) === values.areaId),
  );

  const equipmentIds = toOptions(
    scopedStatuses.map((status) => ({
      value: text(status.equipmentId),
      label: equipmentLabel(status),
    })),
  );

  const scopedSummaries = summaries
    .filter((summary) => {
      // Once equipment is selected, use equipment-scoped response as source of truth
      // so batch options are not dropped because of optional/null plant/area fields.
      if (values.equipmentId) {
        return text(summary.equipmentId) === values.equipmentId;
      }

      return (
        (!values.plantId || text(summary.plantId) === values.plantId) &&
        (!values.areaId || text(summary.areaId) === values.areaId)
      );
    });

  const batchNos = toOptions(
    scopedSummaries
      .map((summary) => ({
        value: text(summary.batchNo),
        label: text(summary.batchNo),
      })),
  );
  const lotNos = toOptions(
    [
      ...scopedSummaries
      .filter(
        (summary) =>
          !values.batchNo || text(summary.batchNo) === values.batchNo,
      )
      .map((summary) => ({
        value: text(summary.lotNo),
        label: text(summary.lotNo),
      })),
      ...cppLots.map((lot) => ({ value: lot, label: lot })),
    ],
  );

  return monitoringFields.map((field) => {
    if (field.id === "plantId") {
      return {
        ...field,
        options: [{ value: "", label: field.placeholder }, ...plantOptions],
      };
    }

    if (field.id === "areaId") {
      return {
        ...field,
        options: [{ value: "", label: field.placeholder }, ...areaOptions],
        disabled: !values.plantId,
      };
    }

    if (field.id === "equipmentId") {
      return {
        ...field,
        options: [{ value: "", label: field.placeholder }, ...equipmentIds],
        disabled: !values.areaId,
      };
    }

    if (field.id === "batchNo") {
      return {
        ...field,
        options: [{ value: "", label: field.placeholder }, ...batchNos],
        required: true,
        disabled: !values.equipmentId,
      };
    }

    if (field.id === "lotNo") {
      return {
        ...field,
        options: [{ value: "", label: isLotOptionsLoading ? "Loading Lot Number" : field.placeholder }, ...lotNos],
        required: false,
        disabled: !values.batchNo || isLotOptionsLoading,
      };
    }

    return field;
  });
};

export default function MonitoringConsoleScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [masterData, setMasterData] =
    useState<MasterFilterData>(emptyMasterFilterData);
  const [liveStatuses, setLiveStatuses] = useState<EquipmentLiveStatus[]>([]);
  const [batchSummaries, setBatchSummaries] = useState<BatchSummary[]>([]);
  const [cppLots, setCppLots] = useState<string[]>([]);
  const [isLotOptionsLoading, setIsLotOptionsLoading] = useState(false);
  const [values, setValues] = useState<MonitoringValues>(() =>
    getInitialMonitoringValues(),
  );
  const [draftValues, setDraftValues] = useState<MonitoringValues>(() =>
    getInitialMonitoringValues(),
  );
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<EquipmentLiveStatus | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | undefined>();
  const [parameterRows, setParameterRows] = useState<ParameterRow[]>([]);
  const [alarmRows, setAlarmRows] = useState<AlarmRow[]>([]);
  const [eventRows, setEventRows] = useState<EventRow[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const activeValues = isEditOpen ? draftValues : values;
  const isSelectionMode = searchParams.get("view") === "select";
  const showMonitoringDashboard = isMonitoring && !isSelectionMode;

  const fields = useMemo(
    () =>
      buildMonitoringFields(
        activeValues,
        liveStatuses,
        batchSummaries,
        masterData,
        cppLots,
        isLotOptionsLoading,
      ),
    [
      activeValues,
      liveStatuses,
      batchSummaries,
      masterData,
      cppLots,
      isLotOptionsLoading,
    ],
  );

  const canStart = useMemo(
    () => isCompleteMonitoringSelection(values, fields),
    [fields, values],
  );
  const canSaveDraft = useMemo(
    () => isCompleteMonitoringSelection(draftValues, fields),
    [draftValues, fields],
  );

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      getEquipmentLiveStatuses({}, controller.signal),
      getTopologyRecords("plants", true, controller.signal),
      getTopologyRecords("areas", true, controller.signal),
    ])
      .then(([statuses, plants, areas]) => {
        if (controller.signal.aborted) return;
        setLiveStatuses(statuses);
        setBatchSummaries([]);
        setMasterData({ plants, areas });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load equipment selections.",
        );
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const equipmentId = activeValues.equipmentId;
    if (!equipmentId) {
      return;
    }

    const controller = new AbortController();
    getBatchSummaryPaginated(
      { equipmentId },
      controller.signal,
      { limit: 500, maxPages: 30 },
    )
      .then((summaries) => {
        if (controller.signal.aborted) return;
        setBatchSummaries(summaries);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBatchSummaries([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load batch and lot selections.",
        );
      });

    return () => controller.abort();
  }, [activeValues.equipmentId]);

  useEffect(() => {
    const equipmentId = activeValues.equipmentId;
    const batchNo = activeValues.batchNo;
    if (!equipmentId || !batchNo) {
      return;
    }

    const controller = new AbortController();
    getCppDataPaginated(
      equipmentId,
      { batchNo },
      controller.signal,
      { limit: 500, maxPages: 20 },
    )
      .then((records) => {
        if (controller.signal.aborted) return;

        const uniqueLots = Array.from(
          new Set(
            records
              .map((record) => lotFromCppRecord(record as Record<string, unknown>))
              .filter(Boolean),
          ),
        ).sort((left, right) => left.localeCompare(right));
        setCppLots(uniqueLots);
        setIsLotOptionsLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCppLots([]);
        setIsLotOptionsLoading(false);
      });

    return () => controller.abort();
  }, [activeValues.batchNo, activeValues.equipmentId]);

  useEffect(() => {
    if (showMonitoringDashboard) {
      setTopBarSelection(pathname, values.equipmentId);
      return;
    }

    clearTopBarSelection(pathname);
  }, [pathname, showMonitoringDashboard, values.equipmentId]);

  function handleValueChange(id: string, value: string) {
    if (id === "plantId" || id === "areaId" || id === "equipmentId") {
      setBatchSummaries([]);
      setCppLots([]);
      setIsLotOptionsLoading(false);
    }
    if (id === "batchNo") {
      setCppLots([]);
      setIsLotOptionsLoading(false);
    }

    setValues((current) => {
      if (id === "plantId") {
        return {
          ...current,
          plantId: value,
          areaId: "",
          equipmentId: "",
          batchNo: "",
          lotNo: "",
        };
      }
      if (id === "areaId") {
        return {
          ...current,
          areaId: value,
          equipmentId: "",
          batchNo: "",
          lotNo: "",
        };
      }
      if (id === "equipmentId") {
        return {
          ...current,
          equipmentId: value,
          batchNo: "",
          lotNo: "",
        };
      }
      if (id === "batchNo") {
        return {
          ...current,
          batchNo: value,
          lotNo: "",
        };
      }
      return { ...current, [id]: value };
    });
  }

  function handleDraftValueChange(id: string, value: string) {
    if (id === "plantId" || id === "areaId" || id === "equipmentId") {
      setBatchSummaries([]);
      setCppLots([]);
      setIsLotOptionsLoading(false);
    }
    if (id === "batchNo") {
      setCppLots([]);
      setIsLotOptionsLoading(false);
    }

    setDraftValues((current) => {
      if (id === "plantId") {
        return {
          ...current,
          plantId: value,
          areaId: "",
          equipmentId: "",
          batchNo: "",
          lotNo: "",
        };
      }
      if (id === "areaId") {
        return {
          ...current,
          areaId: value,
          equipmentId: "",
          batchNo: "",
          lotNo: "",
        };
      }
      if (id === "equipmentId") {
        return {
          ...current,
          equipmentId: value,
          batchNo: "",
          lotNo: "",
        };
      }
      if (id === "batchNo") {
        return {
          ...current,
          batchNo: value,
          lotNo: "",
        };
      }
      return { ...current, [id]: value };
    });
  }

  function handleClear() {
    const initialValues = getInitialMonitoringValues(fields);
    setValues(initialValues);
    setDraftValues(initialValues);
    setIsMonitoring(false);
    setIsEditOpen(false);
    setBatchSummaries([]);
    setCppLots([]);
    setIsLotOptionsLoading(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.batchNo) {
      setErrorMessage("Batch No is mandatory.");
      return;
    }
    if (canStart) {
      void loadMonitoringReport(values);
    }
  }

  function handleEditOpen() {
    setDraftValues(values);
    setIsEditOpen(true);
  }

  function handleEditClear() {
    setDraftValues(getInitialMonitoringValues(fields));
  }

  function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftValues.batchNo) {
      setErrorMessage("Batch No is mandatory.");
      return;
    }
    if (canSaveDraft) {
      void loadMonitoringReport(draftValues, true);
    }
  }

  async function loadMonitoringReport(
    nextValues: MonitoringValues,
    closePanel = false,
  ) {
    setErrorMessage("");

    try {
      const selectedEquipmentId = nextValues.equipmentId;
      const scopedSummaries = batchSummaries
        .filter(
          (summary) =>
            text(summary.equipmentId) === selectedEquipmentId &&
            (!nextValues.batchNo || text(summary.batchNo) === nextValues.batchNo) &&
            (!nextValues.lotNo || text(summary.lotNo) === nextValues.lotNo),
        )
        .sort(
          (left, right) =>
            (parseDateTime(right.batchEndAt ?? right.updatedAt)?.getTime() ?? 0) -
            (parseDateTime(left.batchEndAt ?? left.updatedAt)?.getTime() ?? 0),
        );
      const selectedBatchNo =
        nextValues.batchNo
          ? nextValues.batchNo
          : text(scopedSummaries[0]?.batchNo);

      const batchScopedQuery = {
        limit: 100,
        ...(selectedBatchNo ? { batchNo: selectedBatchNo } : {}),
        ...(nextValues.lotNo ? { lotNo: nextValues.lotNo } : {}),
      };

      const batchSummaryQuery = {
        equipmentId: selectedEquipmentId,
        limit: 1000,
        ...(selectedBatchNo ? { batchNo: selectedBatchNo } : {}),
        ...(nextValues.lotNo ? { lotNo: nextValues.lotNo } : {}),
      };

      const [live, batches, cpp, alarmEvents] = await Promise.all([
        getEquipmentLiveStatus(selectedEquipmentId),
        getBatchSummaryPaginated(batchSummaryQuery, undefined, {
          limit: 500,
          maxPages: 20,
        }),
        getCppData(selectedEquipmentId, batchScopedQuery),
        getAlarmEventData(selectedEquipmentId, batchScopedQuery),
      ]);

      setValues(nextValues);
      setDraftValues(nextValues);
      setLiveStatus(live);
      setBatchSummary(
        normalizeBatchSummary(
          batches.filter(
            (summary) =>
              (!nextValues.batchNo || text(summary.batchNo) === nextValues.batchNo) &&
              (!nextValues.lotNo || text(summary.lotNo) === nextValues.lotNo),
          ),
        ),
      );
      setParameterRows(normalizeCppToParameterRows(cpp));
      setAlarmRows(normalizeAlarmRows(alarmEvents));
      setEventRows(normalizeEventRows(alarmEvents));
      setIsMonitoring(true);
      router.replace(pathname);
      if (closePanel) setIsEditOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load monitoring report.",
      );
    }
  }

  return (
    <section aria-label="Monitoring Console" className="grid gap-5">
      {showMonitoringDashboard ? (
        <MonitoringDashboard
          values={values}
          liveStatus={liveStatus}
          batchSummary={batchSummary}
          parameterRows={parameterRows}
          alarmRows={alarmRows}
          eventRows={eventRows}
          onEdit={handleEditOpen}
        />
      ) : (
        <>
          <MonitoringFormCard
            values={values}
            fields={fields}
            onValueChange={handleValueChange}
            onClear={handleClear}
            onSubmit={handleSubmit}
          />
          <WaitingStateCard />
        </>
      )}

      <SidePanel
        isOpen={isEditOpen && !isSelectionMode}
        title="Edit Entry"
        onClose={() => setIsEditOpen(false)}
      >
        <MonitoringFormCard
          compact
          values={draftValues}
          fields={fields}
          onValueChange={handleDraftValueChange}
          onClear={handleEditClear}
          onSubmit={handleEditSubmit}
        />
      </SidePanel>

      <Snackbar
        open={Boolean(errorMessage)}
        title="Monitoring operation failed"
        message={errorMessage}
        variant="error"
        onClose={() => setErrorMessage("")}
      />
    </section>
  );
}
