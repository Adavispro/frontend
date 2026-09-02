import { ROUTES } from "@/config/routes";
import totalUsersIcon from "@/assets/status/Users.svg";
import userGroupsIcon from "@/assets/status/groups-pink.svg";
import activeUsersIcon from "@/assets/status/running-brown.svg";
import userRolesIcon from "@/assets/status/roles-green.svg";
import idleUsersIcon from "@/assets/status/warning.svg";
import type { SystemAdminDashboardData } from "../api";
import MetricCard from "./MetricCard";

export default function MetricCards({
  data,
  isLoading,
}: {
  data: SystemAdminDashboardData | null;
  isLoading: boolean;
}) {
  const loadingValue = isLoading ? "..." : "0";
  const userTiles = data?.userTiles;
  const totalUsers = userTiles?.totalUsersCount ?? data?.userStats?.total ?? 0;
  const activeUsers = userTiles?.activeUsersCount ?? data?.userStats?.active ?? 0;
  const idleUsers = userTiles?.idleUsersCount ?? data?.userStats?.idle ?? 0;
  const totalOnline = userTiles?.totalOnlineUsersCount ?? (activeUsers + idleUsers);
  const configuredRoles = userTiles?.configuredRolesCount ?? data?.roles?.length ?? 0;
  const configuredGroups = userTiles?.configuredGroupsCount ?? data?.groups?.length ?? 0;

  const metricNote = (note: string) =>
    isLoading ? "Loading latest data" : note;

  const cards = [
    {
      label: "Total Registered Users",
      value: data ? String(totalUsers) : loadingValue,
      note: metricNote(`${totalUsers} registered accounts`),
      icon: totalUsersIcon,
      variant: "primary",
      href: ROUTES.masterUsers,
    },
    {
      label: "Active Logged-in Users",
      value: data ? String(activeUsers) : loadingValue,
      note: metricNote(
        totalOnline > 0
          ? `${Math.round((activeUsers / totalOnline) * 100)}% of online sessions`
          : "0 active sessions",
      ),
      icon: activeUsersIcon,
      variant: "brown",
      href: ROUTES.masterActiveUsers,
    },
    {
      label: "Idle Users",
      value: data ? String(idleUsers) : loadingValue,
      note: metricNote(
        totalOnline > 0
          ? `${Math.round((idleUsers / totalOnline) * 100)}% of online sessions`
          : "0 idle sessions",
      ),
      icon: idleUsersIcon,
      variant: "yellow",
      href: ROUTES.masterIdleUsers,
    },
    {
      label: "Configured Roles",
      value: data ? String(configuredRoles) : loadingValue,
      note: metricNote(`${configuredRoles} active roles`),
      icon: userRolesIcon,
      variant: "green",
      href: ROUTES.masterRoles,
    },
    {
      label: "Configured Groups",
      value: data ? String(configuredGroups) : loadingValue,
      note: metricNote(`${configuredGroups} active groups`),
      icon: userGroupsIcon,
      variant: "pink",
      href: ROUTES.masterUserGroups,
    },
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </div>
  );
}
