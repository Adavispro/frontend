import DoughnutChart from "@/components/charts/DoughnutChart";
import type { SystemAdminDashboardData } from "../api";
import { getStatusPercent } from "../utils/dashboard-formatters";
import DashboardPanel from "./DashboardPanel";

export default function UserStatusOverviewCard({
  data,
}: {
  data: SystemAdminDashboardData | null;
}) {
  const userTiles = data?.userTiles;
  const activeCount = userTiles?.activeUsersCount ?? data?.userStats?.active ?? 0;
  const idleCount = userTiles?.idleUsersCount ?? data?.userStats?.idle ?? 0;
  const totalCount = userTiles?.totalUsersCount ?? data?.userStats?.total ?? 0;

  const segments = [
    {
      label: "Active Users",
      value: activeCount,
      displayValue: String(activeCount),
      color: "#2FB1A6",
      gradientTo: "#89D4CD",
      legendOrder: 1,
    },
    {
      label: "Idle Users",
      value: idleCount,
      displayValue: String(idleCount),
      color: "#FFB857",
      gradientTo: "#F2D07A",
      legendOrder: 2,
    },
  ];

  return (
    <DashboardPanel title="User Activity Overview">
      <div className="mt-5 flex justify-center">
        <DoughnutChart
          segments={segments}
          centerValue={String(totalCount)}
          centerLabel="users"
          size={116}
          strokeWidth={15}
          gapDegrees={4}
          legendValueSuffix=""
          legendLabelWidth={100}
          centerLabelClassName="type-chart-center-label mt-0.5 capitalize"
        />
      </div>
    </DashboardPanel>
  );
}
