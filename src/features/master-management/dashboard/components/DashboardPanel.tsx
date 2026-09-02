import type { ReactNode } from "react";

export default function DashboardPanel({
  title,
  subtitle,
  headerAction,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`module-glass-panel relative rounded-lg p-5 shadow-[0_14px_26px_rgba(35,50,70,0.12)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] sm:text-[18px] font-semibold leading-snug text-text-heading">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-[13px] font-normal leading-normal text-text-secondary">
              {subtitle}
            </p>
          ) : null}
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {children}
    </article>
  );
}
