import { apiClient } from "@/api/client";
import type { BackendApiResponse } from "@/api/types";
import type {
  NotificationItem,
  NotificationListResponse,
  UnreadCountResponse,
} from "../schemas/notifications.schema";

export const getNotifications = (
  params: { unreadOnly?: boolean; page?: number; limit?: number; plantId?: string } = {},
  signal?: AbortSignal,
) => {
  const searchParams = new URLSearchParams();
  if (params.unreadOnly) searchParams.set("unreadOnly", "true");
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.plantId) searchParams.set("plantId", params.plantId);

  const queryStr = searchParams.toString();
  const endpoint = `/api/notifications${queryStr ? `?${queryStr}` : ""}`;

  return apiClient<BackendApiResponse<NotificationListResponse>>(endpoint, {
    method: "GET",
    signal,
  }).then((res) => res.data);
};

export const getUnreadCount = (params: { plantId?: string } = {}, signal?: AbortSignal) => {
  const searchParams = new URLSearchParams();
  if (params.plantId) searchParams.set("plantId", params.plantId);
  const queryStr = searchParams.toString();
  const endpoint = `/api/notifications/unread-count${queryStr ? `?${queryStr}` : ""}`;

  return apiClient<BackendApiResponse<UnreadCountResponse>>(endpoint, {
    method: "GET",
    signal,
  }).then((res) => res.data);
};

export const markNotificationAsRead = (notificationId: string, params: { plantId?: string } = {}) => {
  const searchParams = new URLSearchParams();
  if (params.plantId) searchParams.set("plantId", params.plantId);
  const queryStr = searchParams.toString();
  const endpoint = `/api/notifications/${encodeURIComponent(notificationId)}/read${queryStr ? `?${queryStr}` : ""}`;

  return apiClient<BackendApiResponse<{ notificationId: string; isRead: boolean }>>(
    endpoint,
    {
      method: "POST",
    },
  ).then((res) => res.data);
};

export const markAllNotificationsAsRead = (params: { plantId?: string } = {}) => {
  const searchParams = new URLSearchParams();
  if (params.plantId) searchParams.set("plantId", params.plantId);
  const queryStr = searchParams.toString();
  const endpoint = `/api/notifications/mark-all-read${queryStr ? `?${queryStr}` : ""}`;

  return apiClient<BackendApiResponse<{ updatedCount: number }>>(
    endpoint,
    {
      method: "POST",
    },
  ).then((res) => res.data);
};
