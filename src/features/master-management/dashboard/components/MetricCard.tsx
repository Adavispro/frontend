import Image from "next/image";
import Link from "next/link";
import type { StaticImageData } from "next/image";

export type MetricCardVariant =
  | "blue"
  | "brown"
  | "green"
  | "pink"
  | "primary"
  | "purple"
  | "red"
  | "yellow";

export interface MetricCardProps {
  label: string;
  value: string;
  note: string;
  icon: StaticImageData;
  variant: MetricCardVariant;
  href?: string;
}

export default function MetricCard({
  label,
  value,
  note,
  icon,
  variant,
  href,
}: MetricCardProps) {
  const styles = {
    primary:
      "bg-[#F4EEFF] border-[#DECFFC] shadow-[0_4px_14px_rgba(115,82,184,0.08)] hover:shadow-[0_8px_20px_rgba(115,82,184,0.14)] hover:border-[#CBB4FA]",
    brown:
      "bg-[#FAF4EE] border-[#EBD8C7] shadow-[0_4px_14px_rgba(139,94,60,0.05)] hover:shadow-[0_8px_20px_rgba(139,94,60,0.1)] hover:border-[#D6BC9E]",
    green:
      "bg-[#ECF9F1] border-[#C2EED7] shadow-[0_4px_14px_rgba(22,131,75,0.05)] hover:shadow-[0_8px_20px_rgba(22,131,75,0.1)] hover:border-[#A3E5C2]",
    yellow:
      "bg-[#FFF8DF] border-[#FCECB5] shadow-[0_4px_14px_rgba(166,106,0,0.05)] hover:shadow-[0_8px_20px_rgba(166,106,0,0.1)] hover:border-[#F9DE87]",
    red:
      "bg-[#FCEAEA] border-[#F8C8C8] shadow-[0_4px_14px_rgba(240,68,68,0.05)] hover:shadow-[0_8px_20px_rgba(240,68,68,0.1)] hover:border-[#F49A9A]",
    blue:
      "bg-[#EEF3FF] border-[#C9D9FD] shadow-[0_4px_14px_rgba(64,86,181,0.05)] hover:shadow-[0_8px_20px_rgba(64,86,181,0.1)] hover:border-[#AEC4FB]",
    purple:
      "bg-[#F4EEFF] border-[#DECFFC] shadow-[0_4px_14px_rgba(115,82,184,0.05)] hover:shadow-[0_8px_20px_rgba(115,82,184,0.1)] hover:border-[#CBB4FA]",
    pink:
      "bg-[#FFF0F5] border-[#FCD3E3] shadow-[0_4px_14px_rgba(184,50,128,0.05)] hover:shadow-[0_8px_20px_rgba(184,50,128,0.1)] hover:border-[#F9B4D0]",
  }[variant];

  const labelColor = {
    primary: "text-[#7352B8]",
    brown: "text-[#8B5E3C]",
    green: "text-[#16834B]",
    yellow: "text-[#A66A00]",
    blue: "text-[#4056B5]",
    purple: "text-[#7352B8]",
    pink: "text-[#B83280]",
    red: "text-[#C92A2A]",
  }[variant];

  const valueColor = {
    primary: "text-[#7352B8]",
    brown: "text-[#8B5E3C]",
    green: "text-[#16834B]",
    yellow: "text-[#A66A00]",
    blue: "text-[#4056B5]",
    purple: "text-[#7352B8]",
    pink: "text-[#B83280]",
    red: "text-[#C92A2A]",
  }[variant];

  const noteColor = {
    primary: "text-[#7352B8]",
    brown: "text-[#8B5E3C]",
    green: "text-[#16834B]",
    yellow: "text-[#A66A00]",
    blue: "text-[#4056B5]",
    purple: "text-[#7352B8]",
    pink: "text-[#B83280]",
    red: "text-[#C92A2A]",
  }[variant];

  const iconOpacity = variant === "primary" ? "opacity-85" : "opacity-75";

  const content = (
    <div className="flex h-full min-h-[138px] sm:min-h-[140px] flex-col justify-between">
      <div className="flex items-start justify-between gap-2 pr-10">
        <p className={`text-[15px] sm:text-[16px] font-semibold leading-tight ${labelColor}`}>
          {label}
        </p>
      </div>

      <div className="mt-auto pt-2">
        <strong
          className={`block text-[38px] sm:text-[40px] font-bold leading-none tracking-tight ${valueColor}`}
        >
          {value}
        </strong>
        <p className={`mt-2 text-[13px] sm:text-[14px] font-medium leading-tight ${noteColor}`}>
          {note}
        </p>
      </div>

      <Image
        src={icon}
        alt=""
        aria-hidden="true"
        className={`absolute right-5 top-5 h-9 w-9 object-contain pointer-events-none ${iconOpacity}`}
      />
    </div>
  );

  const className = `relative flex min-h-[138px] sm:min-h-[140px] w-full flex-col justify-between overflow-hidden rounded-[12px] border p-5 text-left transition-transform hover:-translate-y-0.5 ${styles}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <article className={className}>{content}</article>;
}


