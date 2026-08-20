"use client";

import { useEffect, useState } from "react";
import { getLoginContext } from "../api";
import type { CurrentUser, LoginContext } from "../api/types";

let loginContextRequest: Promise<LoginContext> | null = null;
let cachedLoginContext: LoginContext | null = null;
const LOGIN_CONTEXT_CHANGED_EVENT = "adavis:login-context-changed";

export interface InvalidateLoginContextOptions {
  refetch?: boolean;
}

export const loadLoginContext = (): Promise<LoginContext> => {
  if (loginContextRequest) {
    return loginContextRequest;
  }

  loginContextRequest = getLoginContext()
    .then((context) => {
      cachedLoginContext = context;
      return context;
    })
    .catch((error) => {
      loginContextRequest = null;
      cachedLoginContext = null;
      throw error;
    });

  return loginContextRequest;
};

export const invalidateLoginContext = (options?: InvalidateLoginContextOptions) => {
  loginContextRequest = null;
  cachedLoginContext = null;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(LOGIN_CONTEXT_CHANGED_EVENT, {
        detail: {
          action: options?.refetch ? "refetch" : "clear",
        },
      }),
    );
  }
};

export function useLoginContext() {
  const [context, setContext] = useState<LoginContext | null>(() => cachedLoginContext);

  useEffect(() => {
    let active = true;

    const handleContextEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      const action = customEvent.detail?.action;

      if (action === "clear") {
        if (active) setContext(null);
        return;
      }

      // Refetch requested
      void loadLoginContext()
        .then((value) => {
          if (active) setContext(value);
        })
        .catch(() => {
          if (active) setContext(null);
        });
    };

    if (!cachedLoginContext) {
      void loadLoginContext()
        .then((value) => {
          if (active) setContext(value);
        })
        .catch(() => {
          if (active) setContext(null);
        });
    } else {
      setContext(cachedLoginContext);
    }

    window.addEventListener(LOGIN_CONTEXT_CHANGED_EVENT, handleContextEvent);

    return () => {
      active = false;
      window.removeEventListener(LOGIN_CONTEXT_CHANGED_EVENT, handleContextEvent);
    };
  }, []);

  return context;
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(() => cachedLoginContext?.user ?? null);

  useEffect(() => {
    let active = true;

    const handleContextEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      const action = customEvent.detail?.action;

      if (action === "clear") {
        if (active) setUser(null);
        return;
      }

      void loadLoginContext()
        .then((context) => {
          if (active) setUser(context.user);
        })
        .catch(() => {
          if (active) setUser(null);
        });
    };

    if (!cachedLoginContext) {
      void loadLoginContext()
        .then((context) => {
          if (active) setUser(context.user);
        })
        .catch(() => {
          if (active) setUser(null);
        });
    } else {
      setUser(cachedLoginContext.user);
    }

    window.addEventListener(LOGIN_CONTEXT_CHANGED_EVENT, handleContextEvent);

    return () => {
      active = false;
      window.removeEventListener(LOGIN_CONTEXT_CHANGED_EVENT, handleContextEvent);
    };
  }, []);

  return user;
}
