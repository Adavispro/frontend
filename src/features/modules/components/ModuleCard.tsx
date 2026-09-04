import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react";
import type { AppRoute } from "@/config/routes";
import type { ModuleStatus } from "@/features/modules/types/module.types";

export interface ModuleCardProps {
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  href: AppRoute;
  status?: ModuleStatus;
}

export default function ModuleCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  href,
  status = "active",
}: ModuleCardProps) {
  const isUnderDevelopment = status === "under-development";

  if (isUnderDevelopment) {
    return (
      <article
        aria-label={`${title} - Module Under Development`}
        className="
          relative flex min-h-[220px] flex-col justify-between rounded-2xl
          border border-slate-200/90
          p-6
          shadow-[0_4px_16px_rgba(20,40,70,0.05)]
          cursor-default select-none
          transition-all duration-200
        "
        style={{
          background: `linear-gradient(145deg, #ffffff 0%, #ffffff 65%, ${iconBg}40 100%)`,
        }}
      >
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-black/5 shadow-sm opacity-85"
              style={{ backgroundColor: iconBg, color: iconColor }}
            >
              {icon}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Under Development
            </span>
          </div>

          <h3 className="mb-2 text-base sm:text-lg font-bold leading-snug text-slate-800 tracking-tight">
            {title}
          </h3>

          <p className="text-xs sm:text-[0.84rem] leading-relaxed text-slate-500 line-clamp-3">
            {description}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
          <span className="font-semibold text-slate-600">
            Module Under Development
          </span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
            Coming Soon
          </span>
        </div>
      </article>
    );
  }

  return (
    <Link
      href={href}
      aria-label={`Open ${title}`}
      className="
        group relative flex min-h-[220px] flex-col justify-between rounded-2xl
        border border-slate-200/90
        p-6
        shadow-[0_4px_16px_rgba(20,40,70,0.06)]
        transition-all duration-200 ease-out
        hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(20,40,70,0.12)]
        hover:border-primary/40
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
      "
      style={{
        background: `linear-gradient(145deg, #ffffff 0%, #ffffff 60%, ${iconBg}66 100%)`,
      }}
    >
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-black/5 shadow-sm transition-transform duration-200 group-hover:scale-105"
            style={{ backgroundColor: iconBg, color: iconColor }}
          >
            {icon}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Operational
          </span>
        </div>

        <h3 className="mb-2 text-base sm:text-lg font-bold leading-snug text-slate-800 tracking-tight group-hover:text-primary transition-colors">
          {title}
        </h3>

        <p className="text-xs sm:text-[0.84rem] leading-relaxed text-slate-500 line-clamp-3">
          {description}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-xs font-semibold text-primary group-hover:underline">
          Launch Module
        </span>
        <span
          className="
            flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white
            shadow-sm transition-all duration-200
            group-hover:bg-primary-hover group-hover:scale-110 group-hover:shadow-md
          "
        >
          <ArrowUpRight size={16} weight="bold" />
        </span>
      </div>
    </Link>
  );
}

