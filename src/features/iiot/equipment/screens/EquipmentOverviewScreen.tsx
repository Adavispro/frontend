"use client";

import { useEffect, useMemo, useState } from "react";
import BarChart from "@/components/charts/BarChart";
import DoughnutChart from "@/components/charts/DoughnutChart";
import LineChart from "@/components/charts/LineChart";
import { Snackbar } from "@/components/ui";
import { getAllTopologyRecords } from "@/features/master-management/plant-topology/api/topology.api";
import type { Area, Block, Plant, Room } from "@/features/master-management/shared/schemas";
import { getEquipmentLiveStatuses, getBatchSummaryPaginated, getIiotTopology } from "../api/reports.api";
import EquipmentFilterSection, {
  type EquipmentFilterOptions,
  type EquipmentFilterValues,
} from "../components/EquipmentFilterSection";
import EquipmentStatusCards from "../components/EquipmentStatusCards";
import EquipmentTable from "../components/EquipmentTable";
import {
  normalizeLiveStatusToEquipmentRow,
  normalizeEquipmentStatus,
  summarizeEquipmentRows,
} from "../data/report-normalizers";
import type { EquipmentRow } from "../data/equipment-overview";
import type { EquipmentLiveStatus } from "../schemas/reports.schema";

type EquipmentCounts = ReturnType<typeof summarizeEquipmentRows>;
type TrendViewPeriod = "daily" | "weekly" | "monthly" | "quarterly";

const percentOf = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 100) : 0;

const roundChartMax = (value: number) => Math.max(5, Math.ceil(value / 5) * 5);

const getStatusDistributionItems = (counts: EquipmentCounts) => [
  {
    label: "Running",
    value: counts.running,
    color: "#2FB1A6",
    gradientTo: "#8FD1CA",
  },
  {
    label: "Idle",
    value: counts.idle,
    color: "#D8B852",
    gradientTo: "#F3D78A",
  },
  {
    label: "Comm Error",
    value: counts["communication-error"],
    color: "#EF6A70",
    gradientTo: "#FF9A9B",
  },
  {
    label: "Maintenance",
    value: counts.maintenance,
    color: "#6F97D6",
    gradientTo: "#A9C0EA",
  },
  {
    label: "Offline",
    value: counts.offline,
    color: "#8E9194",
    gradientTo: "#D4D4D4",
  },
];

const getStatusScore = (state: unknown) => {
  const status = normalizeEquipmentStatus(state);

  if (status === "Running") return 100;
  if (status === "Maintenance") return 60;
  if (status === "Idle") return 50;
  if (status === "Communication Error") return 20;
  return 0;
};

const getTrendTimestamp = (status: EquipmentLiveStatus) =>
  status.lastEventAt ?? status.heartbeatAt ?? status.updatedAt ?? status.createdAt;

const parseTimestamp = (value: unknown) => {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const formatTrendLabel = (value: unknown, fallback: string) => {
  const time = parseTimestamp(value);
  if (!time) return fallback;

  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "2-digit",
  }).format(new Date(time));
};

const getFilteredStatuses = (
  statuses: EquipmentLiveStatus[],
  filters: EquipmentFilterValues,
) =>
  statuses.filter((status) => {
    const row = normalizeLiveStatusToEquipmentRow(status);
    return getFilteredRows([row], filters).length > 0;
  });

const getPerformanceTrendPoints = (
  statuses: EquipmentLiveStatus[],
  rows: EquipmentRow[],
) => {
  const points = [...statuses]
    .sort((first, second) => {
      const firstTime = parseTimestamp(getTrendTimestamp(first));
      const secondTime = parseTimestamp(getTrendTimestamp(second));
      return firstTime - secondTime;
    })
    .map((status, index) => ({
      label: formatTrendLabel(getTrendTimestamp(status), status.equipmentId),
      value: getStatusScore(status.currentState),
      equipmentId: status.equipmentId,
      timestamp: parseTimestamp(getTrendTimestamp(status)),
      index,
    }));

  if (points.length > 0) {
    return points.slice(-90);
  }

  return rows.slice(0, 15).map((row, index) => ({
    label: row.id,
    value: getStatusScore(row.status),
    equipmentId: row.id,
    timestamp: 0,
    index,
  }));
};

const getQuarter = (month: number) => Math.floor(month / 3) + 1;

const getIsoWeek = (date: Date) => {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

const formatPeriodLabel = (timestamp: number, period: TrendViewPeriod) => {
  if (!timestamp) return "N/A";

  const date = new Date(timestamp);
  if (period === "daily") {
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "2-digit",
    }).format(date);
  }

  if (period === "weekly") {
    const week = getIsoWeek(date);
    return `W${week} ${String(date.getFullYear()).slice(-2)}`;
  }

  if (period === "monthly") {
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      year: "2-digit",
    }).format(date);
  }

  return `Q${getQuarter(date.getMonth())} ${String(date.getFullYear()).slice(-2)}`;
};

const getPeriodKey = (timestamp: number, period: TrendViewPeriod) => {
  if (!timestamp) return "unknown";

  const date = new Date(timestamp);
  if (period === "daily") {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  if (period === "weekly") {
    return `${date.getFullYear()}-W${getIsoWeek(date)}`;
  }

  if (period === "monthly") {
    return `${date.getFullYear()}-${date.getMonth()}`;
  }

  return `${date.getFullYear()}-Q${getQuarter(date.getMonth())}`;
};

const aggregateTrendPoints = (
  points: ReturnType<typeof getPerformanceTrendPoints>,
  period: TrendViewPeriod,
) => {
  if (period === "daily") {
    return points
      .slice(-30)
      .map((point) => ({
        label: formatPeriodLabel(point.timestamp ?? 0, "daily"),
        value: point.value,
      }));
  }

  const bucket = new Map<
    string,
    {
      sum: number;
      count: number;
      latestTimestamp: number;
    }
  >();

  points.forEach((point) => {
    const timestamp = point.timestamp ?? 0;
    const key = getPeriodKey(timestamp, period);
    const current = bucket.get(key);

    if (!current) {
      bucket.set(key, {
        sum: point.value,
        count: 1,
        latestTimestamp: timestamp,
      });
      return;
    }

    current.sum += point.value;
    current.count += 1;
    current.latestTimestamp = Math.max(current.latestTimestamp, timestamp);
  });

  return Array.from(bucket.values())
    .sort((left, right) => left.latestTimestamp - right.latestTimestamp)
    .slice(period === "monthly" || period === "weekly" ? -12 : -8)
    .map((item) => ({
      label: formatPeriodLabel(item.latestTimestamp, period),
      value: Number((item.sum / item.count).toFixed(0)),
    }));
};

function EquipmentHealthCard({ counts }: { counts: EquipmentCounts }) {
  const warningCount = counts.idle + counts.maintenance;
  const healthyPercent = percentOf(counts.running, counts.all);
  const segments = [
    {
      label: "Warning",
      value: warningCount,
      displayValue: percentOf(warningCount, counts.all),
      color: "#3F7ED4",
      gradientTo: "#5A8FE0",
      legendOrder: 2,
    },
    {
      label: "Critical",
      value: counts["communication-error"],
      displayValue: percentOf(counts["communication-error"], counts.all),
      color: "#EF6A70",
      gradientTo: "#FF9A9B",
      legendOrder: 3,
    },
    {
      label: "Healthy",
      value: counts.running,
      displayValue: healthyPercent,
      color: "#2FB1A6",
      gradientTo: "#8FD1CA",
      legendOrder: 1,
    },
  ];

  return (
    <article className="module-glass-card rounded-[8px] p-4 text-text-primary">
      <h3 className="type-card-title text-text-heading">
        Equipment Health Score
      </h3>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="type-metric-large text-text-heading">
            {healthyPercent}%
          </p>
          <p className="type-caption text-text-secondary">
            Operational Reliability
          </p>
        </div>
        <DoughnutChart
          segments={segments}
          centerValue={`${counts.all}`}
          centerLabel="Total Units"
          size={130}
          strokeWidth={14}
        />
      </div>
    </article>
  );
}

function StatusDistributionCard({ counts }: { counts: EquipmentCounts }) {
  const items = getStatusDistributionItems(counts);
  const maxValue = roundChartMax(
    Math.max(...items.map((item) => item.value), 0),
  );

  return (
    <article className="module-glass-card rounded-[8px] p-4 text-text-primary">
      <h3 className="type-card-title text-text-heading">
        Status Distribution
      </h3>
      <div className="mt-6">
        <BarChart items={items} maxValue={maxValue} height={130} />
      </div>
    </article>
  );
}

function PerformanceTrendCard({
  points,
}: {
  points: ReturnType<typeof getPerformanceTrendPoints>;
}) {
  const [period, setPeriod] = useState<TrendViewPeriod>("daily");
  const chartPoints = useMemo(() => aggregateTrendPoints(points, period), [points, period]);

  return (
    <article className="module-glass-card rounded-[8px] p-4 text-text-primary">
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-card-title text-text-heading">
          Performance Trend
        </h3>
        <select
          aria-label="Performance trend period"
          value={period}
          onChange={(event) => setPeriod(event.target.value as TrendViewPeriod)}
          className="module-glass-control type-filter-button h-7 rounded-[4px] px-2 text-text-heading"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
      </div>
      <div className="mt-6">
        <LineChart
          points={chartPoints}
          minValue={0}
          maxValue={100}
          ticks={[100, 75, 50, 25]}
          height={130}
          lineColor="#8175FF"
          fillColor="rgba(129,117,255,0.12)"
          fillColorTo="rgba(129,117,255,0.02)"
          labelInterval={3}
          tickFormatter={(value) => `${value}%`}
          tooltipValueFormatter={(value, point) =>
            `${value}% equipment status health (${point.label})`
          }
        />
      </div>
    </article>
  );
}

const defaultFilterValues: EquipmentFilterValues = {
  plantId: "all",
  blockId: "all",
  areaId: "all",
  roomNo: "all",
};

const emptyTopology = {
  plants: [] as Plant[],
  blocks: [] as Block[],
  areas: [] as Area[],
  rooms: [] as Room[],
};

const getNameMap = <T,>(records: T[], id: (record: T) => string, name: (record: T) => string) =>
  new Map(
    records.map((record) => [id(record), name(record).trim() || id(record)]),
  );

const withTopologyLabels = (
  rows: EquipmentRow[],
  topology: {
    plants: Plant[];
    blocks: Block[];
    areas: Area[];
    rooms: Room[];
  },
) => {
  const plantNames = getNameMap(topology.plants, (item) => item.plantId, (item) => item.plantName);
  const blockNames = getNameMap(topology.blocks, (item) => item.blockId, (item) => item.blockName);
  const areaNames = getNameMap(topology.areas, (item) => item.areaId, (item) => item.areaName);
  const roomNames = getNameMap(topology.rooms, (item) => item.roomId, (item) => item.roomName);
  return rows.map((row) => ({
    ...row,
    plantName: plantNames.get(row.plantId) ?? row.plantName,
    blockName: blockNames.get(row.blockId) ?? row.blockName,
    areaName: areaNames.get(row.areaId) ?? row.areaName,
    roomName: roomNames.get(row.roomNo) ?? row.roomName,
  }));
};

const toTopologyOptions = <T,>(
  records: T[],
  getId: (record: T) => string,
  getLabel: (record: T) => string,
) => {
  const options = new Map<string, string>();

  records.forEach((record) => {
    const value = getId(record).trim();
    if (!value || value === "-") return;

    const label = getLabel(record).trim() || value;
    if (!options.has(value)) {
      options.set(value, label);
    }
  });

  return Array.from(options.entries())
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([value, label]) => ({ value, label }));
};

const getEquipmentFilterOptions = (
  topology: {
    plants: Plant[];
    blocks: Block[];
    areas: Area[];
    rooms: Room[];
  },
  values: EquipmentFilterValues,
): EquipmentFilterOptions => {
  const plants = toTopologyOptions(
    topology.plants,
    (row) => row.plantId,
    (row) => row.plantName,
  );

  const filteredBlocks = topology.blocks.filter(
    (row) => values.plantId === "all" || row.plantId === values.plantId,
  );
  const blocks = toTopologyOptions(
    filteredBlocks,
    (row) => row.blockId,
    (row) => row.blockName,
  );

  const filteredAreas = topology.areas.filter((row) => {
    if (values.plantId !== "all" && row.plantId !== values.plantId) return false;
    if (values.blockId !== "all" && row.blockId !== values.blockId) return false;
    return true;
  });
  const areas = toTopologyOptions(
    filteredAreas,
    (row) => row.areaId,
    (row) => row.areaName,
  );

  const filteredRooms = topology.rooms.filter((row) => {
    if (values.plantId !== "all" && row.plantId !== values.plantId) return false;
    if (values.blockId !== "all" && "blockId" in row && (row as unknown as { blockId: string }).blockId !== values.blockId) return false;
    if (values.areaId !== "all" && row.areaId !== values.areaId) return false;
    return true;
  });
  const rooms = toTopologyOptions(
    filteredRooms,
    (row) => row.roomId,
    (row) => row.roomName,
  );

  return { plants, blocks, areas, rooms };
};

const getFilteredRows = (
  rows: EquipmentRow[],
  filters: EquipmentFilterValues,
) =>
  rows.filter((row) => {
    if (filters.plantId !== "all" && row.plantId !== filters.plantId) {
      return false;
    }

    if (filters.blockId !== "all" && row.blockId !== filters.blockId) {
      return false;
    }

    if (filters.areaId !== "all" && row.areaId !== filters.areaId) {
      return false;
    }

    if (filters.roomNo !== "all" && row.roomNo !== filters.roomNo) {
      return false;
    }

    return true;
  });

export default function EquipmentOverviewScreen() {
  const [allRows, setAllRows] = useState<EquipmentRow[]>([]);
  const [liveStatuses, setLiveStatuses] = useState<EquipmentLiveStatus[]>([]);
  const [topology, setTopology] = useState(emptyTopology);
  const [filters, setFilters] =
    useState<EquipmentFilterValues>(defaultFilterValues);
  const [appliedFilters, setAppliedFilters] =
    useState<EquipmentFilterValues>(defaultFilterValues);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    Promise.allSettled([
      getEquipmentLiveStatuses({}, controller.signal),
      getBatchSummaryPaginated({ limit: 100 }),
      getIiotTopology(controller.signal),
      getAllTopologyRecords("plants", controller.signal, { skipPlantSelection: true }),
      getAllTopologyRecords("blocks", controller.signal, { skipPlantSelection: true }),
      getAllTopologyRecords("areas", controller.signal, { skipPlantSelection: true }),
      getAllTopologyRecords("rooms", controller.signal, { skipPlantSelection: true }),
    ])
      .then(([statusesResult, batchesResult, iiotTopoResult, plantsResult, blocksResult, areasResult, roomsResult]) => {
        if (controller.signal.aborted) return;

        const statuses =
          statusesResult.status === "fulfilled" ? statusesResult.value : [];

        // Merge topology from MDM and IIoT topology endpoints
        const iiotTopo = iiotTopoResult.status === "fulfilled" ? iiotTopoResult.value : { plants: [], blocks: [], areas: [], rooms: [] };

        const plantMap = new Map<string, Plant>();
        (plantsResult.status === "fulfilled" ? (plantsResult.value as Plant[]) : []).forEach((p) => plantMap.set(p.plantId, p));
        (iiotTopo.plants as Plant[]).forEach((p) => { if (p.plantId && !plantMap.has(p.plantId)) plantMap.set(p.plantId, p); });

        const blockMap = new Map<string, Block>();
        (blocksResult.status === "fulfilled" ? (blocksResult.value as Block[]) : []).forEach((b) => blockMap.set(b.blockId, b));
        (iiotTopo.blocks as Block[]).forEach((b) => { if (b.blockId && !blockMap.has(b.blockId)) blockMap.set(b.blockId, b); });

        const areaMap = new Map<string, Area>();
        (areasResult.status === "fulfilled" ? (areasResult.value as Area[]) : []).forEach((a) => areaMap.set(a.areaId, a));
        (iiotTopo.areas as Area[]).forEach((a) => { if (a.areaId && !areaMap.has(a.areaId)) areaMap.set(a.areaId, a); });

        const roomMap = new Map<string, Room>();
        (roomsResult.status === "fulfilled" ? (roomsResult.value as Room[]) : []).forEach((r) => roomMap.set(r.roomId, r));
        (iiotTopo.rooms as Room[]).forEach((r) => { if (r.roomId && !roomMap.has(r.roomId)) roomMap.set(r.roomId, r); });

        // Map latest batch & lot per equipment from active batch summaries
        const latestBatchByEquipment = new Map<string, { batchNo: string; lotNo: string }>();
        if (batchesResult.status === "fulfilled") {
          const summaries = batchesResult.value;
          summaries.forEach((summary) => {
            const bNo = summary.batchNo || "";
            const lNo = summary.lotNo || "";
            const stages = (summary.stages as Array<Record<string, unknown>>) || [];
            stages.forEach((st) => {
              const eq = String(st.equipmentCode || st.equipmentId || "").toUpperCase();
              if (eq && !latestBatchByEquipment.has(eq) && bNo) {
                latestBatchByEquipment.set(eq, { batchNo: bNo, lotNo: String(st.lotNo || lNo || "01 of 05") });
              }
            });
            const mainEq = String(summary.equipmentId || "").toUpperCase();
            if (mainEq && !latestBatchByEquipment.has(mainEq) && bNo) {
              latestBatchByEquipment.set(mainEq, { batchNo: bNo, lotNo: lNo || "01 of 05" });
            }
          });
        }

        const normalizedRows = statuses.map((status) => {
          const row = normalizeLiveStatusToEquipmentRow(status);
          const eqKey = (row.id || "").toUpperCase();
          const batchInfo = latestBatchByEquipment.get(eqKey);
          if (batchInfo) {
            if (!row.lastBatchNo || row.lastBatchNo === "-" || row.lastBatchNo === "N/A") {
              row.lastBatchNo = batchInfo.batchNo;
            }
            if (!row.lastLotNo || row.lastLotNo === "-" || row.lastLotNo === "N/A") {
              row.lastLotNo = batchInfo.lotNo;
            }
          }

          // Fallback topology registration from equipment row metadata
          if (row.plantId && row.plantId !== "-" && !plantMap.has(row.plantId)) {
            plantMap.set(row.plantId, { plantId: row.plantId, plantName: row.plantName || row.plantId, tenantId: "TNT-0001", plantCode: row.plantId, address: {}, timezone: "UTC", type: "Manufacturing", isActive: true, createdAt: "", updatedAt: "" });
          }
          if (row.blockId && row.blockId !== "-" && !blockMap.has(row.blockId)) {
            blockMap.set(row.blockId, { blockId: row.blockId, blockName: row.blockName || row.blockId, plantId: row.plantId, tenantId: "TNT-0001", blockCode: row.blockId, displayOrder: 1, isActive: true, createdAt: "", updatedAt: "" });
          }
          if (row.areaId && row.areaId !== "-" && !areaMap.has(row.areaId)) {
            areaMap.set(row.areaId, { areaId: row.areaId, areaName: row.areaName || row.areaId, blockId: row.blockId, plantId: row.plantId, tenantId: "TNT-0001", areaCode: row.areaId, displayOrder: 1, isActive: true, createdAt: "", updatedAt: "" });
          }
          if (row.roomNo && row.roomNo !== "-" && !roomMap.has(row.roomNo)) {
            roomMap.set(row.roomNo, { roomId: row.roomNo, roomName: row.roomName || row.roomNo, areaId: row.areaId, plantId: row.plantId, tenantId: "TNT-0001", roomCode: row.roomNo, classification: "ISO_8", isActive: true, createdAt: "", updatedAt: "" });
          }

          return row;
        });

        const plants = Array.from(plantMap.values());
        const blocks = Array.from(blockMap.values());
        const areas = Array.from(areaMap.values());
        const rooms = Array.from(roomMap.values());

        setTopology({ plants, blocks, areas, rooms });
        setAllRows(
          withTopologyLabels(normalizedRows, { plants, blocks, areas, rooms }),
        );
        setLiveStatuses(statuses);
        setErrorMessage(
          statusesResult.status === "fulfilled"
            ? ""
            : "Equipment status is unavailable. Master topology filters are still available.",
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load equipment live status.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);
  const rows = useMemo(
    () => getFilteredRows(allRows, appliedFilters),
    [allRows, appliedFilters],
  );
  const filterOptions = useMemo(
    () => getEquipmentFilterOptions(topology, filters),
    [topology, filters],
  );
  const counts = useMemo(() => summarizeEquipmentRows(rows), [rows]);
  const trendPoints = useMemo(
    () =>
      getPerformanceTrendPoints(
        getFilteredStatuses(liveStatuses, appliedFilters),
        rows,
      ),
    [appliedFilters, liveStatuses, rows],
  );

  function handleFilterChange(
    id: keyof EquipmentFilterValues,
    value: string,
  ) {
    setFilters((current) => {
      const updated: EquipmentFilterValues = {
        ...current,
        [id]: value,
        ...(id === "plantId" ? { blockId: "all", areaId: "all", roomNo: "all" } : {}),
        ...(id === "blockId" ? { areaId: "all", roomNo: "all" } : {}),
        ...(id === "areaId" ? { roomNo: "all" } : {}),
      };
      setAppliedFilters(updated);
      return updated;
    });
  }

  function handleFilterSubmit() {
    setAppliedFilters(filters);
  }

  function handleFilterReset() {
    setFilters(defaultFilterValues);
    setAppliedFilters(defaultFilterValues);
  }

  return (
    <section aria-label="Equipment Overview" className="grid gap-4">
      <EquipmentFilterSection
        values={filters}
        options={filterOptions}
        onChange={handleFilterChange}
        onSubmit={handleFilterSubmit}
        onReset={handleFilterReset}
      />

      <EquipmentStatusCards counts={counts} />

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <EquipmentHealthCard counts={counts} />
        <StatusDistributionCard counts={counts} />
        <PerformanceTrendCard points={trendPoints} />
      </div>

      <EquipmentTable
        rows={rows}
        title={isLoading ? "Loading Equipments" : "Available Equipments"}
      />

      <Snackbar
        open={Boolean(errorMessage)}
        title="Unable to load equipment"
        message={errorMessage}
        variant="error"
        onClose={() => setErrorMessage("")}
      />
    </section>
  );
}
