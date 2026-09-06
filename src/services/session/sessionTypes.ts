export const SESSION_INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutes (600,000 ms) of user inactivity
export const SESSION_COUNTDOWN_DURATION_MS = 30 * 1000; // 30 seconds (30,000 ms) warning countdown
export const SESSION_MAX_LIFETIME_MS =
  SESSION_INACTIVITY_LIMIT_MS + SESSION_COUNTDOWN_DURATION_MS; // 10m 30s (630,000 ms) until auto-logout

// Backward-compatible aliases
export const SESSION_IDLE_TIMEOUT_MS = SESSION_INACTIVITY_LIMIT_MS;
export const SESSION_WARNING_TIMEOUT_MS = SESSION_COUNTDOWN_DURATION_MS;
export const SESSION_WARNING_THRESHOLD_MS = SESSION_INACTIVITY_LIMIT_MS;

export const SESSION_ACTIVITY_THROTTLE_MS = 500; // 500 ms throttle for high-frequency events like mousemove
export const SESSION_SYNC_BROADCAST_THROTTLE_MS = 5000; // 5 seconds

export const STORAGE_KEY_LAST_ACTIVITY = "adavis_session_last_activity";
export const STORAGE_KEY_SYNC_EVENT = "adavis_session_sync_event";
export const BROADCAST_CHANNEL_NAME = "adavis_session_channel";

export type SessionCoordinationEventType =
  | "SESSION_ACTIVITY"
  | "SESSION_CONTINUED"
  | "SESSION_TIMEOUT_WARNING"
  | "SESSION_LOGOUT";

export interface SessionCoordinationMessage {
  type: SessionCoordinationEventType;
  timestamp: number;
  tabId: string;
}

export interface SessionInactivityState {
  isWarningOpen: boolean;
  remainingSeconds: number;
  isExpired: boolean;
  isSubmitting: boolean;
}
