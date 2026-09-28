import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import factoryIcon from "@/assets/iiot/factory.svg";
import idleIcon from "@/assets/iiot/idle.svg";
import maintenanceIcon from "@/assets/iiot/maintenance.svg";
import offlineIcon from "@/assets/iiot/offline.svg";
import errorIcon from "@/assets/status/error.svg";
import runningIcon from "@/assets/status/running.svg";
import { PrimaryMetricCard } from "@/components/ui";
import { ROUTE_BUILDERS } from "@/config/routes";
import type { EquipmentStatusFilter } from "../data/equipment-overview";

interface StatusCardProps {
  label: string;
  value: string;
  percentage: string;
  backgroundColor: string;
  icon: StaticImageData;
  status: Exclude<EquipmentStatusFilter, "all">;
}

type StatusCounts = Record<EquipmentStatusFilter, number>;

const statusCardTemplates: Omit<StatusCardProps, "value" | "percentage">[] = [
  {
    label: "Running",
    backgroundColor: "#E7F7EE",
    icon: runningIcon,
    status: "running",
  },
  {
    label: "Idle",
    backgroundColor: "#FFF8DD",
    icon: idleIcon,
    status: "idle",
  },
  {
    label: "Comm. Error",
    backgroundColor: "#FCEAEA",
    icon: errorIcon,
    status: "communication-error",
  },
  {
    label: "Maintenance",
    backgroundColor: "#E8F2FF",
    icon: maintenanceIcon,
    status: "maintenance",
  },
  {
    label: "Offline",
    backgroundColor: "#ECECEE",
    icon: offlineIcon,
    status: "offline",
  },
];

const statusThemes: Record<
  Exclude<EquipmentStatusFilter, "all">,
  {
    blinkClass: string;
    border: string;
    dotPing: string;
    dotBase: string;
    badgeText: string;
  }
> = {
  running: {
    blinkClass: "animate-card-blink-green",
    border: "border-2 border-emerald-400/80",
    dotPing: "bg-emerald-500",
    dotBase: "bg-emerald-600",
    badgeText: "Running",
  },
  idle: {
    blinkClass: "animate-card-blink-amber",
    border: "border-2 border-amber-400/80",
    dotPing: "bg-amber-500",
    dotBase: "bg-amber-600",
    badgeText: "Idle",
  },
  "communication-error": {
    blinkClass: "animate-card-blink-red",
    border: "border-2 border-red-500",
    dotPing: "bg-red-500",
    dotBase: "bg-red-600",
    badgeText: "Comm Error",
  },
  maintenance: {
    blinkClass: "animate-card-blink-sky",
    border: "border-2 border-sky-400/80",
    dotPing: "bg-sky-500",
    dotBase: "bg-sky-600",
    badgeText: "Maintenance",
  },
  offline: {
    blinkClass: "animate-card-blink-slate",
    border: "border-2 border-slate-400/80",
    dotPing: "bg-slate-500",
    dotBase: "bg-slate-600",
    badgeText: "Offline",
  },
};

function StatusCard({
  label,
  value,
  percentage,
  backgroundColor,
  icon,
  status,
}: StatusCardProps) {
  const countNum = Number(value) || 0;
  const isAttention = status === "communication-error" && countNum > 0;
  const theme = statusThemes[status];

  return (
    <Link
      href={ROUTE_BUILDERS.iiotEquipmentStatus(status)}
      aria-label={`View ${label.toLowerCase()} equipment - Blinking Active`}
      className={`relative min-h-[86px] overflow-hidden rounded-lg p-3 text-text-heading transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${theme.border} ${theme.blinkClass}`}
      style={{
        backgroundColor,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="type-dashboard-card-title leading-none font-bold">
          {label}
        </p>
        <div className="flex items-center gap-1.5">
          {isAttention ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-300 shadow-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-90" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600 ring-2 ring-white" />
              </span>
              Attention
            </span>
          ) : (
            <span className="relative flex h-2.5 w-2.5" title={`${label} live monitoring`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${theme.dotPing} opacity-90`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${theme.dotBase} ring-2 ring-white shadow-xs`} />
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-end gap-1.5">
        <strong className="type-dashboard-card-metric">
          {value}
        </strong>
        <span className="type-dashboard-percent pb-0.5">
          {percentage}
        </span>
      </div>
      <Image
        src={icon}
        alt=""
        aria-hidden="true"
        className="absolute right-3 top-1/2 h-[32px] w-[32px] -translate-y-1/2"
      />
    </Link>
  );
}

const formatPercentage = (value: number, total: number) =>
  total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";

export default function EquipmentStatusCards({
  counts = {
    all: 24,
    running: 24,
    idle: 24,
    "communication-error": 24,
    maintenance: 24,
    offline: 24,
  },
}: {
  counts?: StatusCounts;
}) {
  const total = counts.all;
  const statusCards = statusCardTemplates.map((card) => ({
    ...card,
    value: String(counts[card.status]),
    percentage: formatPercentage(counts[card.status], total),
  }));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.45fr_repeat(5,1fr)]">
      <PrimaryMetricCard
        label="Total Equipment"
        value={String(total)}
        icon={factoryIcon}
        href={ROUTE_BUILDERS.iiotEquipmentStatus("all")}
        ariaLabel="View all equipment - Blinking Active"
        className="animate-card-blink-blue border-2 border-blue-400"
        indicator={
          <span className="relative flex h-2.5 w-2.5" title="Total Equipment Monitoring Active">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-90" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white ring-2 ring-blue-500 shadow-xs" />
          </span>
        }
      />
      {statusCards.map((card) => (
        <StatusCard key={card.label} {...card} />
      ))}
    </div>
  );
}
