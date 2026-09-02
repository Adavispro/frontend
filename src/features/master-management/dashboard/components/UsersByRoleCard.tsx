import BarChart from "@/components/charts/BarChart";
import type { SystemAdminDashboardData } from "../api";
import { normalizeRoleValue } from "../utils/dashboard-formatters";
import DashboardPanel from "./DashboardPanel";

const usersByRoleColors = [
  { color: "#2FB1A6", gradientTo: "#8FD1CA" },
  { color: "#D8B852", gradientTo: "#F3D78A" },
  { color: "#EF6A70", gradientTo: "#FF9A9B" },
  { color: "#6F97D6", gradientTo: "#A9C0EA" },
  { color: "#8E9194", gradientTo: "#D4D4D4" },
];

function getUsersByRoleChartItems(data: SystemAdminDashboardData | null) {
  if (!data || !data.usersByRole) return [];

  const roleCounts = [...data.usersByRole].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.label.localeCompare(b.label);
  });

  const topRoles = roleCounts.slice(0, 4);
  const remainingRoles = roleCounts.slice(4);
  const othersValue = remainingRoles.reduce((total, role) => total + role.value, 0);

  const groupedRoles =
    othersValue > 0 || remainingRoles.length > 0
      ? [
          ...topRoles,
          {
            label: "Others",
            value: othersValue,
          },
        ]
      : topRoles;

  return groupedRoles.map((item, index) => ({
    label: item.label,
    value: item.value,
    color: usersByRoleColors[index]?.color ?? "#6F97D6",
    gradientTo: usersByRoleColors[index]?.gradientTo ?? "#A9C0EA",
  }));
}

export default function UsersByRoleCard({
  data,
  className = "",
}: {
  data: SystemAdminDashboardData | null;
  className?: string;
}) {
  const items = getUsersByRoleChartItems(data);
  const hasData = items.some((item) => item.value > 0);

  return (
    <DashboardPanel title="Users By Role" className={className}>
      <div className="mt-5 min-h-[150px] flex items-center justify-center">
        {hasData ? (
          <BarChart items={items} height={150} />
        ) : (
          <p className="text-center text-[13px] font-medium text-text-secondary">
            No role assignment data available.
          </p>
        )}
      </div>
    </DashboardPanel>
  );
}
