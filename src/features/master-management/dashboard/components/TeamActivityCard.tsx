import type { TeamActivityItem } from "../api";
import DashboardPanel from "./DashboardPanel";

export default function TeamActivityCard({
  activities,
  isLoading,
}: {
  activities: TeamActivityItem[];
  isLoading: boolean;
}) {
  return (
    <DashboardPanel
      title="Team Activity Today"
      subtitle="Live Status of user groups"
      className="min-h-[212px]"
    >
      <div className="mb-3 mt-5 flex min-h-[145px] flex-col justify-between gap-3">
        {activities.map((item) => (
          <div
            key={item.groupId}
            className="grid grid-cols-[130px_minmax(0,1fr)_42px] sm:grid-cols-[145px_minmax(0,1fr)_46px] items-center gap-3.5"
          >
            <span
              className="text-[13px] sm:text-[14px] font-medium truncate text-text-heading"
              title={item.label}
            >
              {item.label}
            </span>
            <span className="block h-2 w-full rounded-full bg-[#D0D5DB]">
              <span
                className="block h-full rounded-full bg-[#128A20]"
                style={{ width: `${item.total ? (item.value / item.total) * 100 : 0}%` }}
              />
            </span>
            <span className="text-right text-[13px] sm:text-[14px] font-semibold text-text-heading">
              {item.value}/{item.total}
            </span>
          </div>
        ))}
        {!activities.length ? (
          <div className="grid min-h-[145px] place-items-center text-[13px] font-medium text-text-secondary">
            {isLoading ? "Loading team activity..." : "No active group assignments found."}
          </div>
        ) : null}
      </div>
    </DashboardPanel>
  );
}
