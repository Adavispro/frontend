import { apiClient } from "@/api/client";
import type { BackendApiResponse } from "@/api/types";
import type {
  NotificationItem,
  NotificationListResponse,
  UnreadCountResponse,
} from "../schemas/notifications.schema";

export const getNotifications = (
  params: { unreadOnly?: boolean; page?: number; limit?: number } = {},
  signal?: AbortSignal,
) => {
  const searchParams = new URLSearchParams();
  if (params.unreadOnly) searchParams.set("unreadOnly", "true");
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const queryStr = searchParams.toString();
  const endpoint = `/api/notifications${queryStr ? `?${queryStr}` : ""}`;

  return apiClient<BackendApiResponse<NotificationListResponse>>(endpoint, {
    method: "GET",
    signal,
  }).then((res) => res.data);
};

export const getUnreadCount = (signal?: AbortSignal) =>
  apiClient<BackendApiResponse<UnreadCountResponse>>("/api/notifications/unread-count", {
    method: "GET",
    signal,
  }).then((res) => res.data);

export const markNotificationAsRead = (notificationId: string) =>
  apiClient<BackendApiResponse<{ notificationId: string; isRead: boolean }>>(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
    },
  ).then((res) => res.data);

export const markAllNotificationsAsRead = () =>
  apiClient<BackendApiResponse<{ updatedCount: number }>>(
    "/api/notifications/mark-all-read",
    {
      method: "POST",
    },
  ).then((res) => res.data);
