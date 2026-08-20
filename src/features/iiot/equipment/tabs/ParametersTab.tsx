import {
  ArrowsClockwise,
  Check,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import Image from "next/image";
import type { StaticImageData } from "next/image";
import totalParametersIcon from "@/assets/iiot/totalparameters.svg";
import criticalStatusIcon from "@/assets/status/critical.svg";
import warningStatusIcon from "@/assets/status/warning.svg";
import DataTable, { type DataTableColumn } from "@/components/table/DataTable";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { parameterRows } from "../data/data";
import type { ParameterRow, ParameterStatus } from "../data/types";

const summaryCardTemplates = [
  {
    label: "Total Parameters",
    value: "24",
    className:
      "bg-[linear-gradient(90deg,#0254C7_0%,#0E5880_100%)] text-white shadow-[0_14px_28px_rgba(6,79,165,0.25)]",
    icon: SlidersHorizontal,
    imageIcon: totalParametersIcon,
    iconClassName: "text-white/35",
  },
  {
    label: "Normal",
    value: "18",
    meta: "(79%)",
    className: "bg-[#E7F7EE] text-text-heading",
    icon: Check,
    iconClassName: "bg-[#BFEBD3] text-white",
  },
  {
    label: "Warning",
    value: "18",
    meta: "(79%)",
    className: "bg-[#FFF8DD] text-text-heading",
    statusIcon: warningStatusIcon,
    iconClassName: "opacity-80",
  },
  {
    label: "Critical",
    value: "18",
    meta: "(79%)",
    className: "bg-[#FCEAEA] text-text-heading",
    statusIcon: criticalStatusIcon,
    iconClassName: "opacity-90",
  },
];

function metricCellClass(status: ParameterStatus) {
  if (status === "Critical") return "text-[#D43B3B]";
  if (status === "Warning") return "text-[#B48205]";
  return "text-success";
}

function MetricValueCell({
  value,
  status,
}: {
  value: string;
  status: ParameterStatus;
}) {
  return <span className={`font-semibold ${metricCellClass(status)}`}>{value}</span>;
}

function DetailSummaryCard({
  label,
  value,
  meta,
  className,
  icon: Icon,
  imageIcon,
  statusIcon,
  iconClassName,
}: {
  label: string;
  value: string;
  meta?: string;
  className?: string;
  icon?: any;
  imageIcon?: StaticImageData;
  statusIcon?: StaticImageData;
  iconClassName?: string;
}) {
  const isPrimaryCard = label === "Total Parameters";

  return (
    <article
      className={`relative min-h-[76px] overflow-hidden rounded-md border border-white/65 p-3 shadow-[0_10px_20px_rgba(35,50,70,0.12)] ${className}`}
    >
      <p className={`type-dashboard-card-title ${isPrimaryCard ? "!text-white" : ""}`}>
        {label}
      </p>
      <div className="mt-4 flex items-end gap-1.5">
        <strong className="type-detail-card-metric text-[24px]">{value}</strong>
        {meta ? (
          <span className="pb-1 text-xs font-medium text-current">{meta}</span>
        ) : null}
      </div>
      <span
        className={`absolute grid place-items-center rounded-full ${isPrimaryCard ? "right-7 top-[58%] h-14 w-14 -translate-y-1/2" : "right-5 top-1/2 h-8 w-8 -translate-y-1/2"} ${iconClassName}`}
      >
        {statusIcon !== undefined ? (
          <Image
            src={statusIcon}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-contain"
          />
        ) : imageIcon !== undefined ? (
          <span
            className="h-full w-full bg-current"
            style={{
              maskImage: `url(${imageIcon.src})`,
              WebkitMaskImage: `url(${imageIcon.src})`,
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
              maskSize: "contain",
              WebkitMaskSize: "contain",
            }}
          />
        ) : Icon !== undefined ? (
          <Icon size={24} weight="bold" />
        ) : null}
      </span>
    </article>
  );
}

const parameterColumns: DataTableColumn<ParameterRow>[] = [
  {
    key: "date",
    header: "Date",
    render: (row) => row.date,
    className:
      "sticky left-0 z-20 min-w-[140px] bg-white shadow-[1px_0_0_0_#E2E9F2] [thead_&]:bg-[#E7F0FA]",
  },
  {
    key: "time",
    header: "Time",
    render: (row) => row.time,
    className:
      "sticky left-[140px] z-20 min-w-[130px] bg-white shadow-[1px_0_0_0_#E2E9F2] [thead_&]:bg-[#E7F0FA]",
  },
];

export default function ParametersTab({
  rows = parameterRows,
  showSummaryCards = true,
  isLoading = false,
}: {
  rows?: ParameterRow[];
  showSummaryCards?: boolean;
  isLoading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortBy, setSortBy] = useState<string>("time");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [columnFilterBy, setColumnFilterBy] = useState<string>("all");
  const [columnFilterValue, setColumnFilterValue] = useState("");

  const effectiveMetricLabels = useMemo(() => {
    const fallback = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row.metricValues ?? {}).forEach((label) => fallback.add(label));
    });
    return Array.from(fallback);
  }, [rows]);

  const dynamicColumns = useMemo<DataTableColumn<ParameterRow>[]>(() => {
    const metricCols = effectiveMetricLabels.map((label) => ({
      key: `metric-${label}`,
      header: label,
      render: (row: ParameterRow) => {
        const status = row.metricStatuses[label] ?? "Normal";
        const value = row.metricValues[label] ?? "-";
        const isBlackLabel = ["mode", "status", "cycle"].includes(
          label.toLowerCase(),
        );

        if (isBlackLabel) {
          return <span className="font-semibold text-black">{value}</span>;
        }

        return <MetricValueCell value={value} status={status} />;
      },
    }));

    return [...parameterColumns, ...metricCols];
  }, [effectiveMetricLabels]);

  const dateOptions = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((row) => row.date).filter(Boolean)))],
    [rows],
  );
  const columnOptions = useMemo(
    () => ["date", "time", ...effectiveMetricLabels],
    [effectiveMetricLabels],
  );

  const getColumnValue = (row: ParameterRow, column: string) => {
    if (column === "date") return row.date;
    if (column === "time") return row.time;
    return row.metricValues[column] ?? "";
  };

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedColumnFilter = columnFilterValue.trim().toLowerCase();

    return rows.filter((row) => {
      if (dateFilter !== "all" && row.date !== dateFilter) return false;

      if (columnFilterBy !== "all" && normalizedColumnFilter) {
        const value = String(getColumnValue(row, columnFilterBy)).toLowerCase();
        if (!value.includes(normalizedColumnFilter)) return false;
      }

      if (!normalizedQuery) return true;
      const dynamicValues = effectiveMetricLabels
        .map((label) => row.metricValues[label] ?? "")
        .join(" ");

      return [
        row.date,
        row.time,
        dynamicValues,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [
    rows,
    query,
    dateFilter,
    effectiveMetricLabels,
    columnFilterBy,
    columnFilterValue,
  ]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      const aValue =
        sortBy === "time"
          ? a.observedAtIso
          : String(getColumnValue(a, sortBy) ?? "");
      const bValue =
        sortBy === "time"
          ? b.observedAtIso
          : String(getColumnValue(b, sortBy) ?? "");

      const aNumber = Number.parseFloat(String(aValue));
      const bNumber = Number.parseFloat(String(bValue));
      const bothNumeric = Number.isFinite(aNumber) && Number.isFinite(bNumber);

      let compare = 0;
      if (sortBy === "time") {
        compare =
          new Date(String(aValue)).getTime() - new Date(String(bValue)).getTime();
      } else if (bothNumeric) {
        compare = aNumber - bNumber;
      } else {
        compare = String(aValue).localeCompare(String(bValue), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }

      return sortDirection === "asc" ? compare : -compare;
    });

    return sorted;
  }, [filteredRows, sortBy, sortDirection]);

  const normalCount = rows.filter((row) => row.status === "Normal").length;
  const warningCount = rows.filter((row) => row.status === "Warning").length;
  const criticalCount = rows.filter((row) => row.status === "Critical").length;
  const totalCount = rows.length;

  const summaryCards = summaryCardTemplates.map((card) => {
    if (card.label === "Total Parameters") {
      return { ...card, value: String(totalCount) };
    }
    if (card.label === "Normal") {
      return { ...card, value: String(normalCount), meta: "" };
    }
    if (card.label === "Warning") {
      return { ...card, value: String(warningCount), meta: "" };
    }
    if (card.label === "Critical") {
      return { ...card, value: String(criticalCount), meta: "" };
    }
    return card;
  });

  return (
    <div className="grid min-w-0 max-w-full gap-4 overflow-x-hidden">
      {showSummaryCards ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <DetailSummaryCard key={card.label} {...card} />
          ))}
        </div>
      ) : null}

      <DataTable
        title="Parameters"
        columns={dynamicColumns}
        rows={sortedRows}
        getRowKey={(row, index) => `${row.observedAtIso}-${row.parameterKey}-${index}`}
        tableClassName="w-max min-w-full whitespace-nowrap"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {isLoading ? (
              <span className="inline-flex items-center gap-1 rounded-[4px] border border-[#D9E2EE] bg-white/70 px-2 py-1 text-[11px] font-medium text-primary">
                <ArrowsClockwise size={12} className="animate-spin" />
                Loading CPP data...
              </span>
            ) : null}
            <label className="module-glass-control flex h-8 items-center gap-2 rounded-[4px] px-3 text-text-secondary">
              <MagnifyingGlass size={14} />
              <span className="sr-only">Search parameters</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Date/Time/Parameters"
                className="type-filter-value min-w-[220px] bg-transparent outline-none placeholder:text-text-secondary"
              />
            </label>

            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="module-glass-control type-filter-button h-8 rounded-[4px] px-3 text-text-heading"
            >
              {dateOptions.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All Dates" : value}
                </option>
              ))}
            </select>

            <select
              value={columnFilterBy}
              onChange={(event) => setColumnFilterBy(event.target.value)}
              className="module-glass-control type-filter-button h-8 rounded-[4px] px-3 text-text-heading"
            >
              <option value="all">Filter Column</option>
              {columnOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>

            <label className="module-glass-control flex h-8 items-center gap-2 rounded-[4px] px-3 text-text-secondary">
              <input
                type="search"
                value={columnFilterValue}
                onChange={(event) => setColumnFilterValue(event.target.value)}
                placeholder="Filter selected column"
                className="type-filter-value min-w-[180px] bg-transparent outline-none placeholder:text-text-secondary"
              />
            </label>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="module-glass-control type-filter-button h-8 rounded-[4px] px-3 text-text-heading"
            >
              {columnOptions.map((value) => (
                <option key={value} value={value}>
                  Sort: {value}
                </option>
              ))}
            </select>

            <select
              value={sortDirection}
              onChange={(event) =>
                setSortDirection(event.target.value as "asc" | "desc")
              }
              className="module-glass-control type-filter-button h-8 rounded-[4px] px-3 text-text-heading"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        }
        footerText={undefined}
        pageSize={10}
        pageSizeOptions={[10, 20, 30]}
        emptyText={isLoading ? "Loading CPP data..." : "No records match the active filter criteria."}
        fillHeight={false}
        className="w-full"
      />
    </div>
  );
}
