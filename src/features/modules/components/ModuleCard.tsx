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
          relative flex min-h-[168px] flex-col justify-between rounded-[14px]
          border border-[#e1e5ea]
          p-4 pb-3.5
          shadow-[0_4px_12px_rgba(21,40,64,0.06)]
          cursor-default select-none
        "
        style={{
          background: `linear-gradient(135deg, #ffffff 0%, ${iconBg}33 100%)`,
        }}
      >
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg opacity-85"
              style={{ backgroundColor: iconBg, color: iconColor }}
            >
              {icon}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-0.5 text-[0.60rem] font-medium text-[#64748b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
              Under Development
            </span>
          </div>

          <p className="mb-1.5 text-[0.78rem] font-semibold leading-snug text-[#334155]">
            {title}
          </p>

          <p className="text-[0.59rem] leading-[1.65] text-[#64748b]">
            {description}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-[#edf2f7] pt-2.5 text-[0.62rem]">
          <span className="font-semibold text-[#475569]">
            Module Under Development
          </span>
          <span className="font-medium text-[#94a3b8]">
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
        group relative flex min-h-[168px] flex-col justify-between rounded-[14px]
        border border-[#e1e5ea]
        p-4 pb-3.5
        shadow-[0_8px_18px_rgba(21,40,64,0.10)]
        transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(21,40,64,0.14)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
      "
      style={{
        background: `linear-gradient(135deg, #ffffff 0%, ${iconBg}66 100%)`,
      }}
    >
      <div>
        <div
          className="mb-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          {icon}
        </div>

        <p className="mb-1.5 text-[0.78rem] font-semibold leading-snug text-[#0056b8]">
          {title}
        </p>

        <p className="max-w-[92%] text-[0.59rem] leading-[1.65] text-[#424850]">
          {description}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-end pt-2.5">
        <span
          className="
            flex h-7 w-7 items-center justify-center rounded-full bg-[#0058b8]
            transition-colors group-hover:bg-primary-hover
          "
        >
          <ArrowUpRight size={13} weight="bold" color="white" />
        </span>
      </div>
    </Link>
  );
}

