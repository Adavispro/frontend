"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretRight, Gear, LockKey, NotePencil } from "@phosphor-icons/react";
import { ROUTES } from "@/config/routes";

export default function SettingsDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("adavis:close-popovers", {
            detail: { id: "settings" },
          }),
        );
      }
    }
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleClosePopovers = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id !== "settings") {
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

  const items = [
    {
      label: "Edit Profile",
      description: "Update personal details",
      icon: NotePencil,
      href: ROUTES.editProfile,
    },
    {
      label: "Update Password",
      description: "Change account password",
      icon: LockKey,
      href: ROUTES.updatePassword,
    },
  ];

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      <button
        type="button"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={handleToggle}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#3f464f] transition-colors hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Gear size={17} weight="regular" />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-[130] w-56 pt-2">
          <div
            role="menu"
            className="relative rounded-xl border border-white/80 bg-white/95 p-2 shadow-[0_16px_42px_rgba(48,69,94,0.18)] backdrop-blur-xl"
          >
            <span
              aria-hidden="true"
              className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t border-white/80 bg-white"
            />
            {items.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    router.push(item.href);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#F4F8FE]"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#E6F1FF] text-primary">
                    <Icon size={16} weight="regular" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-text-heading">
                      {item.label}
                    </span>
                    <span className="block truncate text-[10px] font-medium text-text-secondary">
                      {item.description}
                    </span>
                  </span>
                  <CaretRight size={12} weight="bold" className="text-primary" />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
