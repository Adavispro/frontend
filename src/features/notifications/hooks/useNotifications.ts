"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../api/notifications.api";
import type { NotificationItem } from "../schemas/notifications.schema";
import {
  readSelectedPlantId,
  SELECTED_PLANT_CHANGED_EVENT,
} from "@/utils/plantSelection";

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [currentPlantId, setCurrentPlantId] = useState<string>("");
  const isFetchingRef = useRef(false);
  const plantIdRef = useRef<string>("");

  useEffect(() => {
    const initialPlant = readSelectedPlantId();
    setCurrentPlantId(initialPlant);
    plantIdRef.current = initialPlant;

    const handlePlantChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ plantId?: string }>;
      const nextPlant = customEvent.detail?.plantId ?? readSelectedPlantId();
      setCurrentPlantId(nextPlant);
      plantIdRef.current = nextPlant;
    };

    window.addEventListener(SELECTED_PLANT_CHANGED_EVENT, handlePlantChanged);
    return () => {
      window.removeEventListener(SELECTED_PLANT_CHANGED_EVENT, handlePlantChanged);
    };
  }, []);

  const fetchCount = useCallback(async (plantId?: string) => {
    const targetPlant = plantId !== undefined ? plantId : plantIdRef.current;
    try {
      const data = await getUnreadCount({ plantId: targetPlant });
      if (data && typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Background poll silently fails without disrupting UI
    }
  }, []);

  const loadList = useCallback(
    async (params: { unreadOnly?: boolean; page?: number; limit?: number; plantId?: string } = {}) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setIsLoading(true);
      setError("");

      const targetPlant = params.plantId !== undefined ? params.plantId : plantIdRef.current;

      try {
        const data = await getNotifications({ ...params, plantId: targetPlant });
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
      await markNotificationAsRead(notificationId, { plantId: plantIdRef.current });
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
      await markAllNotificationsAsRead({ plantId: plantIdRef.current });
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Ignore failure on mark all read
    }
  }, []);

  // Refresh notifications and unread count when plant changes
  useEffect(() => {
    void fetchCount(currentPlantId);
    void loadList({ plantId: currentPlantId });
  }, [currentPlantId, fetchCount, loadList]);

  // Periodic poll for unread notifications (every 20s)
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchCount(plantIdRef.current);
    }, 20000);

    return () => clearInterval(interval);
  }, [fetchCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    currentPlantId,
    refreshNotifications: loadList,
    refreshUnreadCount: fetchCount,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
  };
}
