import Link from "next/link";
import { ROUTES } from "@/config/routes";
import type { TeamActivityItem } from "../api";
import DashboardPanel from "./DashboardPanel";

export default function TeamActivityCard({
  activities,
  isLoading,
}: {
  activities: TeamActivityItem[];
  isLoading: boolean;
}) {
  // Prioritize active online members, then total members, then alphabetical
  const sortedActivities = [...activities].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    if (b.total !== a.total) return b.total - a.total;
    return a.label.localeCompare(b.label);
  });

  // Filter: Prefer groups with members (total > 0). If all have 0, show active ones.
  const groupsWithMembers = sortedActivities.filter((item) => item.total > 0);
  const displayItems = (groupsWithMembers.length > 0 ? groupsWithMembers : sortedActivities).slice(0, 5);

  return (
    <DashboardPanel
      title="Team Activity Today"
      subtitle="Live Status of user groups"
      className="min-h-[212px]"
      headerAction={
        <Link
          href={ROUTES.masterUserGroups}
          className="text-[13px] sm:text-[14px] font-semibold text-primary hover:underline"
        >
          View all ›
        </Link>
      }
    >
      <div className="mt-5 flex min-h-[145px] flex-col justify-between gap-3.5">
        {displayItems.map((item) => (
          <div
            key={item.groupId}
            className="grid grid-cols-[165px_minmax(0,1fr)_46px] sm:grid-cols-[190px_minmax(0,1fr)_50px] items-center gap-3.5"
          >
            <span
              className="text-[13px] sm:text-[14px] font-medium truncate text-text-heading"
              title={item.label}
            >
              {item.label}
            </span>
            <span className="block h-2 w-full rounded-full bg-[#D0D5DB] overflow-hidden">
              <span
                className="block h-full rounded-full bg-[#128A20] transition-all duration-300"
                style={{ width: `${item.total ? Math.min(100, Math.round((item.value / item.total) * 100)) : 0}%` }}
              />
            </span>
            <span className="text-right text-[13px] sm:text-[14px] font-semibold text-text-heading whitespace-nowrap">
              {item.value}/{item.total}
            </span>
          </div>
        ))}
        {!displayItems.length ? (
          <div className="grid min-h-[145px] place-items-center text-[13px] font-medium text-text-secondary">
            {isLoading ? "Loading team activity..." : "No active group assignments found."}
          </div>
        ) : null}
      </div>
    </DashboardPanel>
  );
}
