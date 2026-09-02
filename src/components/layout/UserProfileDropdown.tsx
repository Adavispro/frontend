"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserCircle } from "@phosphor-icons/react";
import { useCurrentUser, useLoginContext } from "@/features/auth/hooks/useCurrentUser";

export default function UserProfileDropdown() {
  const currentUser = useCurrentUser();
  const loginContext = useLoginContext();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const userInitial =
    currentUser?.firstName?.trim().charAt(0).toUpperCase() ||
    currentUser?.username?.trim().charAt(0).toUpperCase() ||
    currentUser?.userId?.trim().charAt(0).toUpperCase() ||
    "U";

  const userName =
    [currentUser?.firstName, currentUser?.lastName]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(" ") ||
    currentUser?.username ||
    currentUser?.userId ||
    "User";

  const userStatus = currentUser?.status ?? currentUser?.lifecycleStatus ?? "Active";

  const roleName = useMemo(() => {
    const roles = loginContext?.roles ?? [];
    const names = roles
      .map((r) =>
        typeof r.roleName === "string" && r.roleName.trim()
          ? r.roleName.trim()
          : typeof r.name === "string" && r.name.trim()
          ? r.name.trim()
          : typeof r.roleCode === "string" && r.roleCode.trim()
          ? r.roleCode.trim()
          : ""
      )
      .filter(Boolean);

    return names.length > 0 ? names.join(", ") : "System User";
  }, [loginContext?.roles]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("adavis:close-popovers", {
            detail: { id: "user-profile" },
          }),
        );
      }
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleClosePopovers = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id !== "user-profile") {
        setIsOpen(false);
      }
    };

    window.addEventListener("adavis:close-popovers", handleClosePopovers);
    return () => {
      window.removeEventListener("adavis:close-popovers", handleClosePopovers);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <button
        type="button"
        aria-label="User profile"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleToggle}
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#d3ad91] text-xs font-semibold text-white shadow-[0_0_0_1px_#cbd4df] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {userInitial}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-[130] w-72 pt-2">
          <div
            role="dialog"
            aria-label="User details"
            className="rounded-2xl border border-white/80 bg-white/95 p-4 shadow-[0_18px_44px_rgba(48,69,94,0.18)] backdrop-blur-xl"
          >
            <span
              aria-hidden="true"
              className="absolute right-3 top-[-5px] h-3 w-3 rotate-45 border-l border-t border-white/80 bg-white"
            />
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-[#d3ad91] text-base font-semibold text-white shadow-[0_0_0_1px_#cbd4df]">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-heading">
                  {userName}
                </p>
                <p className="truncate text-[11px] font-medium text-text-secondary">
                  {currentUser?.email ?? "No email available"}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 rounded-xl bg-[#F4F8FE] p-3">
              <ProfileDetail label="User ID" value={currentUser?.userId ?? "-"} />
              <ProfileDetail label="Tenant" value={currentUser?.tenantId ?? "-"} />
              <ProfileDetail label="Role" value={roleName} />
              <ProfileDetail label="Status" value={userStatus} />
            </div>

            <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-primary">
              <UserCircle size={14} weight="regular" />
              Signed in profile
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </span>
      <span className="truncate text-right text-[11px] font-semibold text-text-heading">
        {value}
      </span>
    </div>
  );
}
