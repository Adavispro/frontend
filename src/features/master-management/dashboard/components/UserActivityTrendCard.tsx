"use client";

import { useEffect, useMemo, useState } from "react";
import LineChart from "@/components/charts/LineChart";
import { getUserActivityTrendFromBackend, type SystemAdminDashboardData } from "../api";
import { getTrendScale } from "../utils/dashboard-formatters";
import DashboardPanel from "./DashboardPanel";

type TrendMode = "quarterly" | "monthly";

export default function UserActivityTrendCard({
  data,
}: {
  data: SystemAdminDashboardData | null;
}) {
  const [trendMode, setTrendMode] = useState<TrendMode>("quarterly");
  const [modePoints, setModePoints] = useState<Array<{ label: string; value: number }>>([]);

  const tenantId = data?.userTiles?.tenantId;

  useEffect(() => {
    let active = true;
    if (trendMode === "quarterly" && data?.loginActivityTrend) {
      setModePoints(data.loginActivityTrend);
      return;
    }

    getUserActivityTrendFromBackend(trendMode, tenantId)
      .then((points: Array<{ label: string; value: number }>) => {
        if (active) {
          setModePoints(points);
        }
      })
      .catch(() => {
        if (active) {
          setModePoints([]);
        }
      });

    return () => {
      active = false;
    };
  }, [trendMode, data?.loginActivityTrend, tenantId]);

  const chartPoints = useMemo(() => {
    if (modePoints.length > 0) return modePoints;
    const defaultLength = trendMode === "monthly" ? 5 : 13;
    return Array.from({ length: defaultLength }, (_, index) => ({
      label: `W${index + 1}`,
      value: 0,
    }));
  }, [modePoints, trendMode]);

  const labelInterval = trendMode === "monthly" ? 1 : 3;
  const hasActivity = chartPoints.some((point) => point.value > 0);
  const { maxValue, ticks } = getTrendScale(
    chartPoints.map((point) => point.value),
  );

  return (
    <DashboardPanel
      title="Login Activity Trend"
      headerAction={
        <label className="flex items-center gap-2 text-[13px] sm:text-[14px] font-medium text-text-secondary">
          <span>View</span>
          <select
            value={trendMode}
            onChange={(event) => setTrendMode(event.target.value as TrendMode)}
            aria-label="Select login activity trend view"
            className="module-glass-control h-8 min-w-[112px] rounded-lg border border-line bg-white px-2.5 text-[13px] sm:text-[14px] font-semibold text-text-heading shadow-[0_4px_10px_rgba(35,50,70,0.08)] outline-none"
          >
            <option value="quarterly">Quarterly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      }
    >
      <div className="mt-4">
        <LineChart
          points={chartPoints}
          maxValue={maxValue}
          ticks={ticks}
          height={150}
          chartWidth={320}
          chartHeight={100}
          labelInterval={labelInterval}
          markerSize="h-1.5 w-1.5"
          tooltipValueFormatter={(value) =>
            `${value} ${value === 1 ? "login" : "logins"}`
          }
        />
        {!hasActivity ? (
          <p className="mt-2 text-center text-[12px] sm:text-[13px] font-medium text-text-secondary">
            No login activity found for the selected period.
          </p>
        ) : null}
      </div>
    </DashboardPanel>
  );
}
