"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { useMemo, useSyncExternalStore } from "react";
import { ROUTES } from "@/config/routes";
import { getSafeReturnTo } from "@/utils/navigation";
import {
  readTopBarSelection,
  TOP_BAR_SELECTION_EVENT,
} from "@/utils/topBarSelection";
import LogoutButton from "./LogoutButton";
import NotificationDropdown from "./NotificationDropdown";
import SettingsDropdown from "./SettingsDropdown";
import UserProfileDropdown from "./UserProfileDropdown";

export interface ModuleTopBarProps {
  title?: string;
  breadcrumbs?: Array<{
    label: string;
    href?: string;
    active?: boolean;
  }>;
  centerText?: string;
}

export default function ModuleTopBar({
  title,
  breadcrumbs,
  centerText,
}: ModuleTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isSelectedMachineRoute =
    pathname === ROUTES.iiotMonitoring || pathname === ROUTES.iiotAnalytics;
  const isDashboard =
    pathname === ROUTES.masterManagement ||
    pathname === "/master-management" ||
    title === "System Admin Dashboard";
  const displayCenterText =
    centerText !== undefined
      ? centerText
      : isDashboard
        ? "Welcome to ADAVISPRO"
        : null;

  const selectedEquipment = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(TOP_BAR_SELECTION_EVENT, onStoreChange);

      return () => {
        window.removeEventListener(TOP_BAR_SELECTION_EVENT, onStoreChange);
      };
    },
    () => (isSelectedMachineRoute ? readTopBarSelection(pathname) : null),
    () => null,
  );
  const selectedMachineBreadcrumbs = useMemo(() => {
    if (selectedEquipment === null || !isSelectedMachineRoute) {
      return undefined;
    }

    const rootBreadcrumb =
      pathname === ROUTES.iiotMonitoring
        ? { label: "Analytics", href: `${ROUTES.iiotMonitoring}?view=select` }
        : { label: "OEE", href: `${ROUTES.iiotAnalytics}?view=select` };

    return [
      rootBreadcrumb,
      { label: selectedEquipment, active: true },
    ];
  }, [isSelectedMachineRoute, pathname, selectedEquipment]);
  const visibleBreadcrumbs = selectedMachineBreadcrumbs ?? breadcrumbs;

  const handleBack = () => {
    const returnTo =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("returnTo")
        : null;

    if (selectedEquipment !== null && isSelectedMachineRoute) {
      router.push(`${pathname}?view=select`);
      return;
    }

    if (pathname === ROUTES.iiotAnalytics) {
      router.push(ROUTES.iiotMonitoring);
      return;
    }

    if (pathname === ROUTES.iiotMonitoring) {
      router.push(ROUTES.iiotEquipmentOverview);
      return;
    }

    if (pathname.startsWith(ROUTES.iiotBatchDetails)) {
      router.push(getSafeReturnTo(returnTo, ROUTES.iiotMyActions));
      return;
    }

    if (returnTo) {
      router.push(getSafeReturnTo(returnTo, ROUTES.modules));
      return;
    }

    if (breadcrumbs && breadcrumbs.length > 1) {
      const parentCrumb = [...breadcrumbs].reverse().find((b) => !b.active && b.href);
      if (parentCrumb?.href) {
        router.push(parentCrumb.href);
        return;
      }
    }

    router.push(ROUTES.modules);
  };

  return (
    <header className="relative flex h-20 shrink-0 items-center justify-between gap-6 px-5 sm:px-6">
      <div className="z-10 flex min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={handleBack}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/70 bg-white/45 text-primary shadow-[0_8px_18px_rgba(35,50,70,0.08)] transition-colors hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>

        {visibleBreadcrumbs !== undefined && visibleBreadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-2">
              {visibleBreadcrumbs.map((breadcrumb, index) => {
                const isLast = index === visibleBreadcrumbs.length - 1;

                return (
                  <li
                    key={`${breadcrumb.label}-${index}`}
                    className="flex min-w-0 items-center gap-2"
                  >
                    {"href" in breadcrumb && breadcrumb.href !== undefined && !isLast && !("active" in breadcrumb && breadcrumb.active) ? (
                      <Link
                        href={breadcrumb.href}
                        className="truncate text-sm font-semibold text-text-secondary transition-colors hover:text-primary"
                      >
                        {breadcrumb.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={isLast || ("active" in breadcrumb && breadcrumb.active) ? "page" : undefined}
                        className={`truncate text-sm font-semibold ${
                          isLast || ("active" in breadcrumb && breadcrumb.active)
                            ? "text-primary"
                            : "text-text-secondary"
                        }`}
                      >
                        {breadcrumb.label}
                      </span>
                    )}
                    {!isLast ? (
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-sm font-semibold text-text-tertiary"
                      >
                        ›
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : title ? (
          <h1 className="min-w-0 truncate text-lg font-semibold text-[#111827]">
            {title}
          </h1>
        ) : null}
      </div>

      {displayCenterText ? (
        <div className="pointer-events-none absolute inset-x-0 inset-y-0 flex items-center justify-center px-20 sm:px-28">
          <span className="truncate text-sm sm:text-base md:text-lg lg:text-[22px] font-semibold text-[#111827]">
            {displayCenterText}
          </span>
        </div>
      ) : null}

      <div className="z-10 ml-auto flex items-center gap-2 text-[#3f464f]">
        <NotificationDropdown />
        <SettingsDropdown />
        <LogoutButton />
        <div className="mx-1 h-7 w-px bg-[#cfd8e4]" />
        <UserProfileDropdown />
      </div>
    </header>
  );
}
