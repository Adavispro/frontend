"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwise,
  Bell,
  CheckCircle,
  Clock,
  Info,
  Warning,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { ROUTES } from "@/config/routes";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import type { NotificationItem } from "@/features/notifications/schemas/notifications.schema";

const formatTime = (isoString: string) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export default function NotificationDropdown() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    refreshNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "UNREAD">("ALL");
  const panelRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (!isOpen) {
      void refreshNotifications({ unreadOnly: activeTab === "UNREAD" });
    }
    setIsOpen((prev) => !prev);
  };

  const handleTabChange = (tab: "ALL" | "UNREAD") => {
    setActiveTab(tab);
    void refreshNotifications({ unreadOnly: tab === "UNREAD" });
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      await markAsRead(item.notificationId);
    }
    setIsOpen(false);

    // Deep link routing based on entity and workflow state
    const state = item.workflowState?.toUpperCase() || "";
    if (state === "APPROVED") {
      router.push(ROUTES.iiotApprovedBatches);
    } else if (state === "UNDER_REVIEW" || state === "REVIEWER_REVIEWED") {
      router.push(ROUTES.iiotMyActions);
    } else if (state === "REJECTED" || state === "PENDING") {
      router.push(ROUTES.iiotPendingReports);
    } else {
      router.push(ROUTES.iiotMyActions);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const displayedNotifications =
    activeTab === "UNREAD"
      ? notifications.filter((item) => !item.isRead)
      : notifications;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        id="notification-bell-btn"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={handleToggle}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Bell size={17} weight={unreadCount > 0 ? "fill" : "regular"} className={unreadCount > 0 ? "text-[#0B63C9]" : "text-[#3f464f]"} />
        {unreadCount > 0 ? (
          <span
            id="notification-unread-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D9383A] px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Notifications panel"
          className="absolute right-0 top-full z-[140] mt-2 w-96 rounded-2xl border border-white/80 bg-white/95 p-4 shadow-[0_20px_50px_rgba(30,50,75,0.22)] backdrop-blur-xl transition-all"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                  {unreadCount} unread
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Refresh notifications"
                onClick={() => {
                  void refreshNotifications({ unreadOnly: activeTab === "UNREAD" });
                  void refreshUnreadCount();
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <ArrowClockwise size={14} weight="bold" className={isLoading ? "animate-spin" : ""} />
              </button>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  id="mark-all-read-btn"
                  onClick={() => void markAllAsRead()}
                  className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
                >
                  Mark all read
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="mt-3 flex gap-2 border-b border-gray-100 pb-2">
            <button
              type="button"
              onClick={() => handleTabChange("ALL")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                activeTab === "ALL"
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("UNREAD")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                activeTab === "UNREAD"
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* List Content */}
          <div className="mt-2 max-h-80 overflow-y-auto divide-y divide-gray-50">
            {isLoading && notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">Loading notifications...</div>
            ) : error ? (
              <div className="py-6 text-center text-xs text-red-500">
                {error}
                <button
                  type="button"
                  onClick={() => void refreshNotifications()}
                  className="mt-2 block w-full text-blue-600 underline"
                >
                  Retry
                </button>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle size={28} weight="duotone" className="mx-auto text-gray-300" />
                <p className="mt-2 text-xs font-medium text-gray-500">You're all caught up!</p>
                <p className="mt-0.5 text-[11px] text-gray-400">No {activeTab === "UNREAD" ? "unread " : ""}notifications.</p>
              </div>
            ) : (
              displayedNotifications.map((item) => {
                const isError = item.severity === "ERROR";
                const isSuccess = item.severity === "SUCCESS";
                const isWarning = item.severity === "WARNING";

                const IconComponent = isError
                  ? WarningCircle
                  : isSuccess
                  ? CheckCircle
                  : isWarning
                  ? Warning
                  : Info;

                const iconColor = isError
                  ? "text-red-500 bg-red-50"
                  : isSuccess
                  ? "text-emerald-600 bg-emerald-50"
                  : isWarning
                  ? "text-amber-600 bg-amber-50"
                  : "text-blue-600 bg-blue-50";

                return (
                  <div
                    key={item.notificationId}
                    data-notification-id={item.notificationId}
                    onClick={() => void handleNotificationClick(item)}
                    className={`group relative flex cursor-pointer items-start gap-3 p-3 transition-colors hover:bg-blue-50/40 ${
                      !item.isRead ? "bg-blue-50/20" : ""
                    }`}
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
                      <IconComponent size={16} weight="fill" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-xs font-semibold text-gray-900 group-hover:text-blue-600">
                          {item.title}
                        </p>
                        {!item.isRead ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                        ) : null}
                      </div>

                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600 line-clamp-2">
                        {item.message}
                      </p>

                      <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatTime(item.createdAt)}
                        </span>
                        {item.batchNo ? (
                          <span className="rounded bg-gray-100 px-1 py-0.2 text-[9px] font-medium text-gray-600">
                            {item.batchNo}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
