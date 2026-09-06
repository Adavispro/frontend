import { logout, sessionHeartbeat } from "@/features/auth/api";
import { invalidateLoginContext } from "@/features/auth/hooks/useCurrentUser";
import { ROUTES } from "@/config/routes";
import {
  BROADCAST_CHANNEL_NAME,
  SESSION_ACTIVITY_THROTTLE_MS,
  SESSION_INACTIVITY_LIMIT_MS,
  SESSION_MAX_LIFETIME_MS,
  SESSION_SYNC_BROADCAST_THROTTLE_MS,
  STORAGE_KEY_LAST_ACTIVITY,
  STORAGE_KEY_SYNC_EVENT,
  type SessionCoordinationEventType,
  type SessionCoordinationMessage,
  type SessionInactivityState,
} from "./sessionTypes";

type StateListener = (state: SessionInactivityState) => void;

class SessionInactivityManager {
  private tabId: string = Math.random().toString(36).substring(2, 9);
  private lastActivityAt: number = Date.now();
  private lastRecordedEventAt: number = 0;
  private lastBroadcastSyncAt: number = 0;
  private isRunning: boolean = false;
  private isWarningOpen: boolean = false;
  private remainingSeconds: number = 30;
  private isExpired: boolean = false;
  private isSubmitting: boolean = false;

  private tickerTimer: NodeJS.Timeout | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<StateListener> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this.initStorageTimestamp();
      this.initBroadcastChannel();
    }
  }

  private initStorageTimestamp() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= Date.now()) {
          this.lastActivityAt = parsed;
          return;
        }
      }
    } catch {
      // Storage access blocked or unavailable
    }
    this.lastActivityAt = Date.now();
    this.persistLastActivity(this.lastActivityAt);
  }

  private persistLastActivity(timestamp: number) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, String(timestamp));
    } catch {
      // Storage quota or privacy mode
    }
  }

  private initBroadcastChannel() {
    if (typeof window === "undefined") return;

    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event: MessageEvent<SessionCoordinationMessage>) => {
          this.handleCoordinationMessage(event.data);
        };
      } catch {
        this.broadcastChannel = null;
      }
    }

    // Storage event fallback for older browsers or if BroadcastChannel is blocked
    window.addEventListener("storage", (event: StorageEvent) => {
      if (event.key === STORAGE_KEY_SYNC_EVENT && event.newValue) {
        try {
          const msg = JSON.parse(event.newValue) as SessionCoordinationMessage;
          this.handleCoordinationMessage(msg);
        } catch {
          // Ignore corrupt payload
        }
      } else if (event.key === STORAGE_KEY_LAST_ACTIVITY && event.newValue) {
        const parsed = parseInt(event.newValue, 10);
        if (!isNaN(parsed) && parsed > this.lastActivityAt) {
          this.lastActivityAt = parsed;
          if (this.isWarningOpen && Date.now() - this.lastActivityAt < SESSION_INACTIVITY_LIMIT_MS) {
            this.isWarningOpen = false;
            this.remainingSeconds = 30;
            this.notify();
          }
        }
      }
    });
  }

  private broadcast(type: SessionCoordinationEventType, timestamp: number = Date.now()) {
    const message: SessionCoordinationMessage = {
      type,
      timestamp,
      tabId: this.tabId,
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch {
        // Channel closed
      }
    }

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY_SYNC_EVENT, JSON.stringify(message));
      } catch {
        // Ignore
      }
    }
  }

  private handleCoordinationMessage(msg: SessionCoordinationMessage) {
    if (!msg || msg.tabId === this.tabId) return;

    switch (msg.type) {
      case "SESSION_ACTIVITY":
        if (msg.timestamp && msg.timestamp > this.lastActivityAt) {
          this.lastActivityAt = msg.timestamp;
          if (this.isWarningOpen && Date.now() - this.lastActivityAt < SESSION_INACTIVITY_LIMIT_MS) {
            this.isWarningOpen = false;
            this.remainingSeconds = 30;
            this.notify();
          }
        }
        break;

      case "SESSION_CONTINUED":
        this.lastActivityAt = msg.timestamp || Date.now();
        this.isWarningOpen = false;
        this.remainingSeconds = 30;
        this.isExpired = false;
        this.notify();
        break;

      case "SESSION_LOGOUT":
        this.performLocalCleanupAndRedirect();
        break;

      case "SESSION_TIMEOUT_WARNING":
        if (!this.isWarningOpen && !this.isExpired) {
          this.checkStatus();
        }
        break;
    }
  }

  public getState(): SessionInactivityState {
    return {
      isWarningOpen: this.isWarningOpen,
      remainingSeconds: this.remainingSeconds,
      isExpired: this.isExpired,
      isSubmitting: this.isSubmitting,
    };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch {
        // Listener error suppressed
      }
    });
  }

  public start() {
    if (typeof window === "undefined") return;
    this.isExpired = false;
    this.isSubmitting = false;
    this.isWarningOpen = false;
    this.remainingSeconds = 30;

    if (this.isRunning) {
      this.syncFromStorageAndCheck();
      return;
    }
    this.isRunning = true;

    this.attachEventListeners();
    this.syncFromStorageAndCheck();

    this.tickerTimer = setInterval(() => {
      this.tick();
    }, 500);
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }

    this.detachEventListeners();
    this.isWarningOpen = false;
    this.notify();
  }

  private attachEventListeners() {
    if (typeof window === "undefined") return;

    const events = [
      "mousemove",
      "mousedown",
      "click",
      "keydown",
      "touchstart",
      "scroll",
      "pointerdown",
      "pointermove",
    ];

    events.forEach((evt) => {
      window.addEventListener(evt, this.onUserActivity, { passive: true });
    });

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("focus", this.onWindowFocus);
  }

  private detachEventListeners() {
    if (typeof window === "undefined") return;

    const events = [
      "mousemove",
      "mousedown",
      "click",
      "keydown",
      "touchstart",
      "scroll",
      "pointerdown",
      "pointermove",
    ];

    events.forEach((evt) => {
      window.removeEventListener(evt, this.onUserActivity);
    });

    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("focus", this.onWindowFocus);
  }

  private onUserActivity = () => {
    // If warning modal is open or expired, background mouse/keyboard does NOT reset inactivity
    if (this.isWarningOpen || this.isExpired || this.isSubmitting) {
      return;
    }

    const now = Date.now();
    if (now - this.lastRecordedEventAt < SESSION_ACTIVITY_THROTTLE_MS) {
      return;
    }

    this.lastRecordedEventAt = now;
    this.lastActivityAt = now;
    this.persistLastActivity(now);

    if (now - this.lastBroadcastSyncAt >= SESSION_SYNC_BROADCAST_THROTTLE_MS) {
      this.lastBroadcastSyncAt = now;
      this.broadcast("SESSION_ACTIVITY", now);
    }
  };

  private onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      this.syncFromStorageAndCheck();
    }
  };

  private onWindowFocus = () => {
    this.syncFromStorageAndCheck();
  };

  private syncFromStorageAndCheck() {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > this.lastActivityAt) {
          this.lastActivityAt = parsed;
        }
      }
    } catch {
      // Ignore
    }

    this.checkStatus();
  }

  private tick() {
    this.checkStatus();
  }

  private checkStatus() {
    if (!this.isRunning || this.isExpired || this.isSubmitting) return;

    const elapsed = Date.now() - this.lastActivityAt;

    if (elapsed >= SESSION_MAX_LIFETIME_MS) {
      this.handleTimeoutExpired();
    } else if (elapsed >= SESSION_INACTIVITY_LIMIT_MS) {
      const remainingMs = SESSION_MAX_LIFETIME_MS - elapsed;
      const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
      const wasOpen = this.isWarningOpen;
      const prevSeconds = this.remainingSeconds;

      this.isWarningOpen = true;
      this.remainingSeconds = seconds;

      if (!wasOpen || prevSeconds !== seconds) {
        this.notify();
      }
    } else {
      if (this.isWarningOpen) {
        this.isWarningOpen = false;
        this.remainingSeconds = 30;
        this.notify();
      }
    }
  }

  public async continueSession(): Promise<boolean> {
    if (this.isSubmitting) return false;

    this.isSubmitting = true;
    this.notify();

    try {
      await sessionHeartbeat();

      const now = Date.now();
      this.lastActivityAt = now;
      this.persistLastActivity(now);
      this.broadcast("SESSION_CONTINUED", now);

      this.isWarningOpen = false;
      this.remainingSeconds = 30;
      this.isExpired = false;
      this.isSubmitting = false;
      this.notify();
      return true;
    } catch {
      // Server rejected continuation (session expired or revoked)
      this.isSubmitting = false;
      await this.logoutNow();
      return false;
    }
  }

  public async logoutNow() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.notify();

    this.broadcast("SESSION_LOGOUT");

    try {
      await logout();
    } catch {
      // Ignore logout API error if already expired
    } finally {
      this.performLocalCleanupAndRedirect();
    }
  }

  private async handleTimeoutExpired() {
    this.isExpired = true;
    this.remainingSeconds = 0;
    this.isWarningOpen = true;
    this.notify();

    this.broadcast("SESSION_LOGOUT");

    try {
      await logout();
    } catch {
      // Ignore
    } finally {
      // Delay briefly to allow user to see "Session expired" message if on screen, then redirect
      setTimeout(() => {
        this.performLocalCleanupAndRedirect();
      }, 1500);
    }
  }

  private performLocalCleanupAndRedirect() {
    this.stop();
    invalidateLoginContext({ refetch: false });

    if (typeof window !== "undefined") {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // Ignore
      }
      window.location.replace(ROUTES.login);
    }
  }
}

export const sessionInactivityManager = new SessionInactivityManager();
