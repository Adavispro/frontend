"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../api/notifications.api";
import type { NotificationItem } from "../schemas/notifications.schema";

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const isFetchingRef = useRef(false);

  const fetchCount = useCallback(async () => {
    try {
      const data = await getUnreadCount();
      if (data && typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Background poll silently fails without disrupting UI
    }
  }, []);

  const loadList = useCallback(
    async (params: { unreadOnly?: boolean; page?: number; limit?: number } = {}) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsLoading(true);
      setError("");

      try {
        const data = await getNotifications(params);
        if (data && Array.isArray(data.items)) {
          setNotifications(data.items);
          setUnreadCount(data.unreadCount ?? 0);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unable to load notifications.";
        setError(msg);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    },
    [],
  );

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) =>
          item.notificationId === notificationId ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore failure on optimistic mark read
    }
  }, []);

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Ignore failure on mark all read
    }
  }, []);

  // Poll unread count periodically
  useEffect(() => {
    void fetchCount();
    const interval = setInterval(() => {
      void fetchCount();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refreshNotifications: loadList,
    refreshUnreadCount: fetchCount,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
  };
}
