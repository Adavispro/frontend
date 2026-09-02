import type { AppRoute } from "@/config/routes";

export type ModuleStatus = "active" | "under-development";

export interface ModuleItem {
  id: string;
  title: string;
  description: string;
  /** Key into the icon registry (matches a Phosphor icon name) */
  iconName: string;
  /** Light pastel background for the icon square */
  iconBg: string;
  /** Icon stroke / fill color */
  iconColor: string;
  /** Route to navigate to on click */
  href: AppRoute;
  /** Development/lifecycle status of the module */
  status?: ModuleStatus;
}

export interface ModuleSection {
  id: string;
  title: string;
  modules: ModuleItem[];
}

