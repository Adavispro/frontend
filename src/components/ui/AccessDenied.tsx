"use client";

import Link from "next/link";
import { LockKey, ShieldWarning, House, SquaresFour } from "@phosphor-icons/react";
import { ROUTES } from "@/config/routes";

interface AccessDeniedProps {
  title?: string;
  message?: string;
}

export default function AccessDenied({
  title = "Access Denied",
  message = "Master Management is restricted to System Administrators. You do not have permission to view or manage system master records.",
}: AccessDeniedProps) {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center px-4 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-red-50 text-red-600 shadow-inner ring-8 ring-red-50/50">
        <ShieldWarning size={48} weight="duotone" className="text-red-500" />
        <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow-md">
          <LockKey size={16} weight="bold" />
        </div>
      </div>

      <span className="mb-2 inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-700">
        HTTP 403 · Forbidden
      </span>

      <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
        {title}
      </h1>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-600 sm:text-base">
        {message}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={ROUTES.modules}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <SquaresFour size={18} weight="bold" />
          Go to Modules
        </Link>

        <Link
          href={ROUTES.iiotMyActions}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <House size={18} weight="bold" />
          Go to My Actions
        </Link>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Your authenticated session is active. If you believe this is an error, please contact your System Administrator.
      </p>
    </div>
  );
}
