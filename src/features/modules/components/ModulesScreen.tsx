"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  UsersThree,
  Database,
  Kanban,
  NotePencil,
  ClipboardText,
  Cpu,
  ShieldCheck,
  MagnifyingGlass,
  ChartBar,
  Detective,
  Scales,
  Files,
} from "@phosphor-icons/react";
import type { IconProps } from "@phosphor-icons/react";
import titleImage from "@/assets/modules/title-image.png";
import titleShade from "@/assets/modules/title-shade.png";
import TopNav from "@/components/layout/TopNav";
import { useCurrentUser, useLoginContext } from "@/features/auth/hooks/useCurrentUser";
import { usePermissions } from "@/features/auth/hooks/usePermissions";
import { MODULE_SECTIONS } from "@/features/modules/data/module-data";
import ModuleCard from "./ModuleCard";


type PhosphorIconComponent = React.ComponentType<IconProps>;

const ICON_REGISTRY: Record<string, PhosphorIconComponent> = {
  UsersThree,
  Database,
  Kanban,
  NotePencil,
  ClipboardText,
  Cpu,
  ShieldCheck,
  MagnifyingGlass,
  ChartBar,
  Detective,
  Scales,
  Files,
};

function resolveIcon(name: string, color: string) {
  const Icon = ICON_REGISTRY[name];
  if (!Icon) return null;
  return <Icon size={28} weight="regular" color={color} />;
}


export default function ModulesScreen() {
  const [search, setSearch] = useState("");
  const currentUser = useCurrentUser();
  const loginContext = useLoginContext();
  const { hasPermission, roles } = usePermissions();

  const displayName =
    currentUser?.firstName?.trim() || currentUser?.username || "User";
  const userInitial = displayName.charAt(0).toUpperCase();

  const isModuleAuthorized = (moduleId: string): boolean => {
    // Under-development modules are informational previews
    if (moduleId !== "master-management" && moduleId !== "iiot") {
      return true;
    }

    if (!loginContext) {
      return true;
    }

    const isAdmin = roles.some((r: any) =>
      [
        "SUPER_ADMIN",
        "PLATFORM_SUPER_ADMIN",
        "PLATFORM_ADMIN",
        "IT_ADMIN",
        "ADMIN",
      ].includes(r.roleCode),
    );

    if (isAdmin) {
      return true;
    }

    const rolePermissions = loginContext.rolePermissions || {};
    const hasModuleInRoles = (targetCode: string) => {
      return Object.values(rolePermissions).some((moduleList) => {
        if (!Array.isArray(moduleList)) return false;
        return moduleList.some(
          (m: any) =>
            m.moduleCode === targetCode || m.moduleId === targetCode,
        );
      });
    };

    if (moduleId === "master-management") {
      return (
        hasPermission("MDM_ALL") ||
        hasPermission("ADMIN") ||
        hasModuleInRoles("MOD-MDM")
      );
    }

    if (moduleId === "iiot") {
      return (
        hasPermission("BATCH_READ") ||
        hasPermission("BATCH_SEND_FOR_APPROVAL") ||
        hasPermission("BATCH_APPROVE") ||
        hasModuleInRoles("MOD-IIOT")
      );
    }

    return true;
  };

  const filtered = MODULE_SECTIONS.map((section) => ({
    ...section,
    modules: section.modules
      .filter((m) => isModuleAuthorized(m.id))
      .filter(
        (m) =>
          search.trim() === "" ||
          m.title.toLowerCase().includes(search.toLowerCase()) ||
          m.description.toLowerCase().includes(search.toLowerCase()),
      ),
  })).filter((s) => s.modules.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <TopNav userInitial={userInitial} />

      <main className="mx-auto w-full max-w-[1380px] px-5 pb-14 pt-8 sm:px-6">
        <section className="relative h-[250px] overflow-hidden rounded-[14px] bg-[#2f58bf]">
          <div className="pointer-events-none absolute bottom-0 left-0 h-full w-[38%] select-none opacity-75">
            <Image
              src={titleShade}
              alt=""
              fill
              className="object-cover object-left-bottom"
            />
          </div>

          <div className="pointer-events-none absolute bottom-0 right-3 hidden h-[245px] w-[48%] select-none sm:block">
            <Image
              src={titleImage}
              alt=""
              fill
              className="object-contain object-right-bottom"
              priority
            />
          </div>

          <div className="relative z-10 flex h-full flex-col justify-center px-8 sm:px-12">
            <h1 className="mb-1.5 text-[1.65rem] font-semibold leading-tight">
              <span className="text-[#ffd33f]">
                Welcome {displayName} !
              </span>
            </h1>
            <p className="mb-2 text-[0.94rem] font-medium text-white">
              Select a module to get started
            </p>
            <div className="mb-5 h-[2px] w-[160px] bg-white" />

            <label className="flex h-11 w-full max-w-[420px] items-center gap-2.5 rounded-xl border border-white/25 bg-white/20 px-4 shadow-inner backdrop-blur-sm transition-all focus-within:border-white/50 focus-within:bg-white/25">
              <MagnifyingGlass
                size={18}
                color="rgba(255,255,255,0.95)"
                weight="bold"
              />
              <span className="sr-only">Search modules</span>
              <input
                type="search"
                placeholder="Search modules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/80"
              />
            </label>
          </div>
        </section>

        <div className="mt-12 space-y-16">
          {filtered.map((section) => (
            <section key={section.id}>
              <div className="mb-6 flex items-center gap-3">
                <h2 className="whitespace-nowrap text-sm font-bold tracking-wider text-slate-600 uppercase">
                  {section.title}
                </h2>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {section.modules.map((module) => (
                  <ModuleCard
                    key={module.id}
                    icon={resolveIcon(module.iconName, module.iconColor)}
                    iconBg={module.iconBg}
                    iconColor={module.iconColor}
                    title={module.title}
                    description={module.description}
                    href={module.href}
                    status={module.status}
                  />
                ))}
              </div>
            </section>
          ))}

          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm font-medium text-slate-500">
              No modules match your search query.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
