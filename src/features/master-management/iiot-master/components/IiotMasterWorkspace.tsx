"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Cpu,
  Factory,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Power,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import DataTable, {
  StatusPill,
  type DataTableColumn,
} from "@/components/table/DataTable";
import { ConfirmDialog, Snackbar } from "@/components/ui";
import { ROUTES } from "@/config/routes";
import { usePlantTopology } from "../../plant-topology/hooks/usePlantTopology";
import { useTenants } from "../../tenant-management/hooks/useTenants";
import type {
  CriticalParameter,
  CriticalParameterLimit,
  IiotAsset,
  IiotMasterRecord,
  IiotMasterSection,
  ProductMaster,
  RecipeManagement,
  RecipeMaster,
  UpdateCriticalParameterLimitValues,
  UpdateCriticalParameterValues,
  UpdateIiotAssetValues,
  UpdateProductMasterValues,
  UpdateRecipeManagementValues,
  UpdateRecipeMasterValues,
} from "../api";
import { isMutableIiotMasterSection } from "../api";
import { useIiotMasterData } from "../hooks/useIiotMasterData";
import IiotMasterEditDialog from "./IiotMasterEditDialog";
import RecipeBatchSizeAssociationDialog from "./RecipeBatchSizeAssociationDialog";
import RecipeManagementConfigWorkspace from "./RecipeManagementConfigWorkspace";

const sectionTabs: {
  key: IiotMasterSection;
  label: string;
  href: string;
  icon: typeof Factory;
}[] = [
  {
    key: "equipments",
    label: "Equipment",
    href: ROUTES.masterIiotEquipments,
    icon: Factory,
  },
  {
    key: "critical-parameters",
    label: "Critical Parameters",
    href: ROUTES.masterIiotCriticalParameters,
    icon: SlidersHorizontal,
  },
  {
    key: "product-master",
    label: "Product Master",
    href: ROUTES.masterIiotProductMaster,
    icon: Factory,
  },
  {
    key: "recipe-master",
    label: "Recipe Master",
    href: ROUTES.masterIiotRecipeMaster,
    icon: Cpu,
  },
  {
    key: "recipe-management",
    label: "Recipe Management",
    href: ROUTES.masterIiotRecipeManagement,
    icon: SlidersHorizontal,
  },
];

const sectionTitles: Record<IiotMasterSection, string> = {
  equipments: "Equipment Master",
  "critical-parameters": "Critical Parameters",
  "critical-parameter-limits": "Critical Parameter Limits (Retired)",
  "product-master": "Product Master",
  "recipe-master": "Recipe Master",
  "recipe-management": "Recipe Management",
};

const sectionCreateRoutes: Record<IiotMasterSection, string> = {
  equipments: ROUTES.masterCreateIiotEquipment,
  "critical-parameters": ROUTES.masterCreateIiotCriticalParameter,
  "critical-parameter-limits": ROUTES.masterCreateIiotCriticalParameterLimit,
  "product-master": ROUTES.masterCreateIiotProductMaster,
  "recipe-master": ROUTES.masterCreateIiotRecipeMaster,
  "recipe-management": ROUTES.masterCreateIiotRecipeManagement,
};

const sectionCreateLabels: Record<IiotMasterSection, string> = {
  equipments: "Create Equipment",
  "critical-parameters": "Create Parameter",
  "critical-parameter-limits": "Create Limit",
  "product-master": "Create Product",
  "recipe-master": "Create Recipe Master",
  "recipe-management": "Create Recipe Limit",
};

const sectionLabelFor = (section: IiotMasterSection) =>
  sectionTabs.find((tab) => tab.key === section)?.label ?? "Records";

const formatDate = (value?: string | number | Date | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-GB").replaceAll("/", "-");
};

const formatValue = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const statusPill = (isActive: boolean) => (
  <StatusPill
    label={isActive ? "Active" : "Inactive"}
    className={
      isActive
        ? "bg-[#DDF6DF] text-[#158047]"
        : "bg-[#EBEEF2] text-text-secondary"
    }
  />
);

const actionButton = (
  row: IiotMasterRecord,
  onClick: (record: IiotMasterRecord) => void,
  onEdit: (record: IiotMasterRecord) => void,
) => {
  const active = "isActive" in row ? Boolean(row.isActive) : false;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label="Edit record"
        onClick={() => onEdit(row)}
        className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#EAF3FF] text-primary transition-colors hover:bg-[#D9E9FF]"
      >
        <PencilSimple size={12} />
      </button>
      <button
        type="button"
        aria-label={active ? "Deactivate record" : "Activate record"}
        onClick={() => onClick(row)}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded transition-colors ${
          active
            ? "bg-[#FFF0F0] text-danger hover:bg-[#FFE0E0]"
            : "bg-[#E7F7EE] text-success hover:bg-[#D1F2DF]"
        }`}
      >
        <Power size={12} />
      </button>
    </div>
  );
};

function equipmentColumns(
  getTenantLabel: (tenantId: string) => string,
  getPlantLabel: (plantId: string) => string,
  getAreaLabel: (areaId: string) => string,
  getRoomLabel: (roomId: string) => string,
  onStatusClick: (record: IiotMasterRecord) => void,
  onEditClick: (record: IiotMasterRecord) => void,
): DataTableColumn<IiotAsset>[] {
  return [
    { key: "serial", header: "S No.", render: (_row, index) => index + 1 },
    {
      key: "equipmentCode",
      header: "Equipment Code",
      render: (row) => row.equipmentCode || row.equipmentId,
    },
    { key: "name", header: "Equipment Name", render: (row) => row.equipmentName },
    { key: "tenant", header: "Tenant Name", render: (row) => getTenantLabel(row.tenantId) },
    { key: "plant", header: "Plant Name", render: (row) => getPlantLabel(row.plantId) },
    { key: "area", header: "Area Name", render: (row) => getAreaLabel(row.areaId) },
    { key: "room", header: "Room Name", render: (row) => getRoomLabel(row.roomId) },
    {
      key: "status",
      header: "Status",
      render: (row) => statusPill(row.isActive),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowLink: true,
      render: (row) => actionButton(row, onStatusClick, onEditClick),
    },
  ];
}

function parameterColumns(
  getEquipmentLabel: (equipmentId: string) => string,
  onStatusClick: (record: IiotMasterRecord) => void,
  onEditClick: (record: IiotMasterRecord) => void,
): DataTableColumn<CriticalParameter>[] {
  return [
    { key: "serial", header: "S No.", render: (_row, index) => index + 1 },
    { key: "equipment", header: "Equipment Name", render: (row) => getEquipmentLabel(row.equipmentId) },
    { key: "parameterCode", header: "Parameter Code", render: (row) => row.parameterCode },
    { key: "parameterName", header: "Parameter Name", render: (row) => row.parameterName },
    { key: "unitOfMeasure", header: "Unit Of Measure", render: (row) => formatValue(row.unitOfMeasure) },
    {
      key: "parameterType",
      header: "Type",
      render: (row) => formatValue(row.parameterType),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => statusPill(row.isActive),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowLink: true,
      render: (row) => actionButton(row, onStatusClick, onEditClick),
    },
  ];
}

function limitColumns(
  getParameterLabel: (parameterId: string) => string,
  getParameterType: (parameterId: string) => string,
  onStatusClick: (record: IiotMasterRecord) => void,
  onEditClick: (record: IiotMasterRecord) => void,
): DataTableColumn<CriticalParameterLimit>[] {
  const renderLimitValue = (row: CriticalParameterLimit) => {
    const rowRecord = row as Record<string, unknown>;
    const type = String(
      rowRecord.parameterType || getParameterType(row.parameterId),
    ).toUpperCase();

    if (type === "INT" || type === "FLOAT" || type === "RANGE") {
      return `${formatValue(row.lowCriticalValue)} - ${formatValue(row.highCriticalValue)}`;
    }
    if (type === "BOOLEAN") {
      const explicit = rowRecord.booleanValue;
      if (typeof explicit === "boolean") return explicit ? "True" : "False";
      const inferred = row.lowCriticalValue === 1 && row.highCriticalValue === 1;
      return inferred ? "True" : "False";
    }
    if (type === "ENUM") {
      return formatValue(rowRecord.enumValue);
    }
    if (type === "STRING") {
      return formatValue(rowRecord.stringValue);
    }

    return `${formatValue(row.lowCriticalValue)} - ${formatValue(row.highCriticalValue)}`;
  };

  return [
    { key: "serial", header: "S No.", render: (_row, index) => index + 1 },
    
    {
      key: "parameterName",
      header: "Parameter Name",
      render: (row) => getParameterLabel(row.parameterId),
    },
    {
      key: "parameterType",
      header: "Parameter Type",
      render: (row) => {
        const rowRecord = row as Record<string, unknown>;
        return formatValue(rowRecord.parameterType || getParameterType(row.parameterId));
      },
    },
    {
      key: "parameterLimitCode",
      header: "Parameter Limit Code",
      render: (row) => {
        const rowRecord = row as Record<string, unknown>;
        return String(rowRecord.parameterLimitCode ?? row.parameterLimitId);
      },
    },
    {
      key: "limitValue",
      header: "Limit Value",
      render: (row) => renderLimitValue(row),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => statusPill(row.isActive),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowLink: true,
      render: (row) => actionButton(row, onStatusClick, onEditClick),
    },
  ];
}

function productColumns(
  getTenantLabel: (tenantId: string) => string,
  getPlantLabel: (plantId: string) => string,
  onStatusClick: (record: IiotMasterRecord) => void,
  onEditClick: (record: IiotMasterRecord) => void,
): DataTableColumn<ProductMaster>[] {
  return [
    { key: "serial", header: "S No.", render: (_row, index) => index + 1 },
    { key: "code", header: "Product Code", render: (row) => row.productCode || row.productId },
    { key: "name", header: "Product Name", render: (row) => row.productName },
    { key: "tenant", header: "Tenant", render: (row) => getTenantLabel(row.tenantId) },
    { key: "plant", header: "Plant", render: (row) => getPlantLabel(row.plantId) },
    {
      key: "status",
      header: "Status",
      render: (row) => statusPill(row.isActive),
    },
    {
      key: "created",
      header: "Created",
      render: (row) => formatDate(row.createdAt),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowLink: true,
      render: (row) => actionButton(row, onStatusClick, onEditClick),
    },
  ];
}

function recipeMasterColumns(
  getProductName: (productId: string) => string,
  onStatusClick: (record: IiotMasterRecord) => void,
  onEditClick: (record: IiotMasterRecord) => void,
  onBatchSizesClick: (record: RecipeMaster) => void,
  onConfigureClick: (record: RecipeMaster) => void,
): DataTableColumn<RecipeMaster>[] {
  return [
    { key: "serial", header: "S No.", render: (_row, index) => index + 1 },
    { key: "recipeId", header: "Recipe ID", render: (row) => row.recipeId || row.recipeCode },
    { key: "recipeCode", header: "Recipe Code", render: (row) => row.recipeCode || row.recipeId },
    { key: "recipeName", header: "Recipe Name", render: (row) => row.recipeName },
    { key: "product", header: "Product", render: (row) => row.productName || getProductName(row.productId) },
    { key: "version", header: "Version", render: (row) => row.version || "1.0" },
    {
      key: "batchSizes",
      header: "Associated Batch Sizes",
      render: (row) => {
        const rawBatches = row.associatedBatchSizes as unknown;
        const list: string[] = Array.isArray(rawBatches)
          ? (rawBatches as string[])
          : typeof rawBatches === "string"
            ? rawBatches.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [];
        return (
          <div className="flex flex-wrap items-center gap-1">
            {list.map((size: string) => (
              <span
                key={size}
                className="inline-flex rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700"
              >
                {size}
              </span>
            ))}
            {list.length === 0 && <span className="text-[11px] text-[#94A3B8]">None</span>}
          </div>
        );
      },
    },
    { key: "description", header: "Description", render: (row) => row.description || "-" },
    {
      key: "status",
      header: "Status",
      render: (row) => statusPill(row.isActive),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowLink: true,
      className: "w-[270px] whitespace-nowrap",
      render: (row) => (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <button
            type="button"
            onClick={() => onBatchSizesClick(row)}
            className="inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded border border-[#BBF7D0] bg-[#F0FDF4] px-2.5 text-[10px] font-semibold text-[#16A34A] transition-colors hover:bg-[#DCFCE7]"
            title="Recipe Batch Size Association"
          >
            Batch Sizes
          </button>
          <button
            type="button"
            onClick={() => onConfigureClick(row)}
            className="inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 text-[10px] font-semibold text-[#2563EB] transition-colors hover:bg-[#DBEAFE]"
            title="Configure in Recipe Management"
          >
            Configure
          </button>
          {actionButton(row, onStatusClick, onEditClick)}
        </div>
      ),
    },
  ];
}

function recipeManagementColumns(
  getProductName: (productId: string) => string,
  getRecipeName: (recipeId: string) => string,
  getEquipmentLabel: (equipmentId: string) => string,
  onStatusClick: (record: IiotMasterRecord) => void,
  onEditClick: (record: IiotMasterRecord) => void,
): DataTableColumn<RecipeManagement>[] {
  return [
    { key: "serial", header: "S No.", render: (_row, index) => index + 1 },
    { key: "product", header: "Product", render: (row) => getProductName(row.productId) },
    { key: "recipe", header: "Recipe", render: (row) => getRecipeName(row.recipeId) },
    { key: "batchSize", header: "Batch Size", render: (row) => row.batchSize },
    { key: "equipment", header: "Equipment", render: (row) => getEquipmentLabel(row.equipmentId) },
    { key: "parameterCode", header: "Parameter Code", render: (row) => row.parameterCode },
    { key: "targetSetpoint", header: "Target Setpoint", render: (row) => String(row.targetSetpoint) },
    { key: "lowLimit", header: "Low Limit", render: (row) => String(row.lowLimit) },
    { key: "highLimit", header: "High Limit", render: (row) => String(row.highLimit) },
    {
      key: "range",
      header: "Limit Range",
      render: (row) => `${row.lowLimit} - ${row.highLimit} (Target: ${row.targetSetpoint})`,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => statusPill(row.isActive),
    },
    {
      key: "actions",
      header: "Actions",
      disableRowLink: true,
      render: (row) => actionButton(row, onStatusClick, onEditClick),
    },
  ];
}

const getRecordId = (section: IiotMasterSection, record: IiotMasterRecord) => {
  if (section === "equipments" && "equipmentId" in record) return record.equipmentId;
  if (section === "critical-parameters" && "parameterId" in record) {
    return (
      record.parameterId ||
      `${record.equipmentId || "equipment"}::${record.parameterCode || "parameter"}`
    );
  }
  if (section === "critical-parameter-limits" && "parameterLimitId" in record) {
    return (
      record.parameterLimitId ||
      `${record.equipmentId || "equipment"}::${record.parameterId || "parameter"}::limit`
    );
  }
  if (section === "product-master" && "productId" in record)
    return record.productCode || record.productId;
  if (section === "recipe-master" && "recipeId" in record)
    return record.recipeCode || record.recipeId;
  if (section === "recipe-management" && "recipeManagementId" in record)
    return record.recipeManagementId || record.parameterCode;
  return "record";
};

interface IiotMasterWorkspaceProps {
  section: IiotMasterSection;
}

export default function IiotMasterWorkspace({
  section,
}: IiotMasterWorkspaceProps) {
  const router = useRouter();
  const { tenants } = useTenants();
  const { data: topology } = usePlantTopology();
  const {
    changeStatus,
    clearError,
    errorMessage,
    isLoading,
    records,
    reload,
    replaceRecord,
    updateRecord,
  } = useIiotMasterData();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<IiotMasterRecord | null>(null);
  const [editTarget, setEditTarget] = useState<IiotMasterRecord | null>(null);
  const [changing, setChanging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRecipeForBatchSizes, setSelectedRecipeForBatchSizes] = useState<RecipeMaster | null>(null);
  const [preselectedProduct, setPreselectedProduct] = useState("");
  const [preselectedRecipe, setPreselectedRecipe] = useState("");
  const [preselectedBatchSize, setPreselectedBatchSize] = useState("");
  const [notice, setNotice] = useState({
    message: "",
    variant: "success" as "success" | "error",
  });

  const tenantLabels = useMemo(
    () =>
      Object.fromEntries(
        tenants
          .filter((tenant) => tenant.tenantId)
          .map((tenant) => [tenant.tenantId, tenant.companyName || tenant.tenantId]),
      ),
    [tenants],
  );

  const plantLabels = useMemo(
    () =>
      Object.fromEntries(
        topology.plants.map((plant) => [plant.plantId, plant.plantName || plant.plantId]),
      ),
    [topology.plants],
  );

  const areaLabels = useMemo(
    () =>
      Object.fromEntries(
        topology.areas.map((area) => [area.areaId, area.areaName || area.areaId]),
      ),
    [topology.areas],
  );

  const roomLabels = useMemo(
    () =>
      Object.fromEntries(
        topology.rooms.map((room) => [room.roomId, room.roomName || room.roomId]),
      ),
    [topology.rooms],
  );

  const getTenantLabel = (tenantId: string) => tenantLabels[tenantId] || tenantId;
  const getPlantLabel = (plantId: string) => plantLabels[plantId] || plantId;
  const getAreaLabel = (areaId: string) => areaLabels[areaId] || areaId;
  const getRoomLabel = (roomId: string) => roomLabels[roomId] || roomId;
  const equipmentLabels = useMemo(
    () =>
      Object.fromEntries(
        records.equipments.map((equipment) => [
          equipment.equipmentId,
          `${equipment.equipmentName} (${equipment.equipmentCode || equipment.equipmentId})`,
        ]),
      ),
    [records.equipments],
  );
  const getEquipmentLabel = (equipmentId: string) =>
    equipmentLabels[equipmentId] || equipmentId;
  const parameterLabels = useMemo(
    () =>
      Object.fromEntries(
        records["critical-parameters"].map((parameter) => [
          parameter.parameterId,
          `${parameter.parameterName} (${parameter.parameterCode})`,
        ]),
      ),
    [records],
  );
  const parameterTypes = useMemo(
    () =>
      Object.fromEntries(
        records["critical-parameters"].map((parameter) => [
          parameter.parameterId,
          parameter.parameterType,
        ]),
      ),
    [records],
  );
  const getParameterLabel = (parameterId: string) =>
    parameterLabels[parameterId] || parameterId;
  const getParameterType = (parameterId: string) =>
    parameterTypes[parameterId] || "";

  const productLabels = useMemo(
    () =>
      Object.fromEntries(
        records["product-master"].map((product) => [
          product.productId,
          `${product.productName} (${product.productCode || product.productId})`,
        ]),
      ),
    [records],
  );
  const getProductName = (productId: string) =>
    productLabels[productId] || productId;

  const recipeLabels = useMemo(
    () =>
      Object.fromEntries(
        records["recipe-master"].map((recipe) => [
          recipe.recipeId,
          `${recipe.recipeName} (${recipe.recipeCode || recipe.recipeId})`,
        ]),
      ),
    [records],
  );
  const getRecipeName = (recipeId: string) =>
    recipeLabels[recipeId] || recipeId;

  const activeRows = records[section];
  const rows = useMemo(
    () =>
      activeRows.filter(
        (item) =>
          !search.trim() ||
          Object.values(item).some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(search.trim().toLowerCase()),
          ),
      ),
    [activeRows, search],
  );

  const columns = useMemo(() => {
    if (section === "equipments") {
      return equipmentColumns(
        getTenantLabel,
        getPlantLabel,
        getAreaLabel,
        getRoomLabel,
        setTarget,
        setEditTarget,
      ) as DataTableColumn<IiotMasterRecord>[];
    }
    if (section === "critical-parameters") {
      return parameterColumns(
        getEquipmentLabel,
        setTarget,
        setEditTarget,
      ) as DataTableColumn<IiotMasterRecord>[];
    }
    if (section === "critical-parameter-limits") {
      return limitColumns(
        getParameterLabel,
        getParameterType,
        setTarget,
        setEditTarget,
      ) as DataTableColumn<IiotMasterRecord>[];
    }
    if (section === "recipe-master") {
      return recipeMasterColumns(
        getProductName,
        setTarget,
        setEditTarget,
        (recipe) => setSelectedRecipeForBatchSizes(recipe),
        (recipe) => {
          setPreselectedProduct(recipe.productId);
          setPreselectedRecipe(recipe.recipeId);
          const firstBatch =
            Array.isArray(recipe.associatedBatchSizes) &&
            recipe.associatedBatchSizes.length > 0
              ? recipe.associatedBatchSizes[0]
              : undefined;
          if (firstBatch) setPreselectedBatchSize(firstBatch);
          router.push(ROUTES.masterIiotRecipeManagement);
        },
      ) as DataTableColumn<IiotMasterRecord>[];
    }
    if (section === "recipe-management") {
      return recipeManagementColumns(
        getProductName,
        getRecipeName,
        getEquipmentLabel,
        setTarget,
        setEditTarget,
      ) as DataTableColumn<IiotMasterRecord>[];
    }
    return productColumns(
      getTenantLabel,
      getPlantLabel,
      setTarget,
      setEditTarget,
    ) as DataTableColumn<IiotMasterRecord>[];
  }, [
    getAreaLabel,
    getEquipmentLabel,
    getParameterLabel,
    getParameterType,
    getPlantLabel,
    getProductName,
    getRecipeName,
    getRoomLabel,
    getTenantLabel,
    section,
  ]);

  const changeTargetStatus = async () => {
    if (!target || !isMutableIiotMasterSection(section)) return;

    setChanging(true);
    try {
      await changeStatus(section, target, !Boolean(target.isActive));
      setNotice({
        message: `${getRecordId(section, target)} ${target.isActive ? "deactivated" : "activated"} successfully.`,
        variant: "success",
      });
      setTarget(null);
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : "Unable to update master record.",
        variant: "error",
      });
    } finally {
      setChanging(false);
    }
  };

  const saveTarget = async (
    values:
      | UpdateIiotAssetValues
      | UpdateCriticalParameterValues
      | UpdateCriticalParameterLimitValues
      | UpdateProductMasterValues
      | UpdateRecipeMasterValues
      | UpdateRecipeManagementValues,
  ) => {
    if (!editTarget || !isMutableIiotMasterSection(section)) return;

    setSaving(true);
    try {
      await updateRecord(section, editTarget, values);
      setNotice({
        message: `${getRecordId(section, editTarget)} updated successfully.`,
        variant: "success",
      });
      setEditTarget(null);
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : "Unable to update master record.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid min-h-0 gap-4">
        <section className="module-glass-panel flex flex-wrap items-center justify-between gap-4 rounded-xl p-4 shadow-[0_12px_24px_rgba(35,50,70,0.1)]">
          <div className="flex flex-wrap gap-2">
            {sectionTabs.map(({ key, label, href, icon: Icon }) => {
              const active = key === section;

              return (
                <Link
                  key={key}
                  href={href}
                  className={`inline-flex h-9 items-center gap-2 rounded-[5px] px-4 text-[10px] font-semibold transition-colors ${
                    active
                      ? "bg-primary text-white shadow-[0_7px_16px_rgba(7,92,175,0.2)]"
                      : "module-glass-control text-text-secondary hover:text-primary"
                  }`}
                >
                  <Icon size={14} weight="regular" />
                  <span>{label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8px] ${
                      active ? "bg-white/20" : "bg-primary-light text-primary"
                    }`}
                  >
                    {records[key].length}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {section === "recipe-management" ? (
          <RecipeManagementConfigWorkspace
            products={records["product-master"]}
            recipes={records["recipe-master"]}
            equipments={records.equipments}
            criticalParameters={records["critical-parameters"]}
            recipeManagements={records["recipe-management"]}
            initialProductId={preselectedProduct}
            initialRecipeId={preselectedRecipe}
            initialBatchSize={preselectedBatchSize}
            onRefresh={reload}
            onOpenRecipeMaster={() => router.push(ROUTES.masterIiotRecipeMaster)}
            onOpenBatchSizeAssociation={(recipe) => setSelectedRecipeForBatchSizes(recipe)}
          />
        ) : (
          <DataTable
            title={sectionTitles[section]}
            columns={columns}
            rows={rows as IiotMasterRecord[]}
            getRowKey={(row, index) => `${getRecordId(section, row)}-${index}`}
            emptyText={
              isLoading
                ? "Loading master data..."
                : section === "recipe-master"
                  ? "No recipes configured. Click '+ Create Recipe Master' above to get started."
                  : "No records found."
            }
            showPagination
            pageSize={10}
            pageSizeOptions={[10, 20, 30]}
            toolbar={
              <div className="flex items-center gap-3">
                <label className="module-glass-control hidden h-8 w-[290px] items-center gap-2 rounded-[4px] px-3 text-text-secondary md:flex">
                  <MagnifyingGlass size={13} />
                  <span className="sr-only">Search {sectionLabelFor(section)}</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`Search ${sectionLabelFor(section).toLowerCase()}`}
                    className="type-filter-value min-w-0 flex-1 bg-transparent outline-none"
                  />
                </label>
                <Link
                  href={sectionCreateRoutes[section]}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[4px] bg-primary px-4 text-[10px] font-semibold text-white shadow-[0_8px_18px_rgba(7,92,175,0.18)] transition-colors hover:bg-primary-hover"
                >
                  <Plus size={12} />
                  {sectionCreateLabels[section]}
                </Link>
              </div>
            }
          />
        )}
      </div>

      {selectedRecipeForBatchSizes && (
        <RecipeBatchSizeAssociationDialog
          isOpen={Boolean(selectedRecipeForBatchSizes)}
          recipe={selectedRecipeForBatchSizes}
          onClose={() => setSelectedRecipeForBatchSizes(null)}
          onUpdated={(updated) => {
            replaceRecord("recipe-master", updated);
            setSelectedRecipeForBatchSizes(updated);
          }}
          onNavigateToConfigure={(recipe, batchSize) => {
            setSelectedRecipeForBatchSizes(null);
            setPreselectedProduct(recipe.productId);
            setPreselectedRecipe(recipe.recipeId);
            if (batchSize) setPreselectedBatchSize(batchSize);
            router.push(ROUTES.masterIiotRecipeManagement);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(target)}
        title={`${target?.isActive ? "Deactivate" : "Activate"} Record`}
        message={`${target?.isActive ? "Deactivate" : "Activate"} ${target ? getRecordId(section, target) : "this record"}?`}
        confirmLabel={target?.isActive ? "Deactivate" : "Activate"}
        isConfirming={changing}
        onConfirm={changeTargetStatus}
        onCancel={() => setTarget(null)}
      />

      {editTarget ? (
        <IiotMasterEditDialog
          key={`${section}-${getRecordId(section, editTarget)}`}
          isOpen
          section={section}
          record={editTarget}
          equipments={records.equipments}
          criticalParameters={records["critical-parameters"]}
          products={records["product-master"]}
          recipeMasters={records["recipe-master"]}
          isSaving={saving}
          onClose={() => {
            if (!saving) setEditTarget(null);
          }}
          onSave={saveTarget}
        />
      ) : null}

      <Snackbar
        open={Boolean(errorMessage || notice.message)}
        title={
          errorMessage || notice.variant === "error"
            ? "Master operation failed"
            : "Master updated"
        }
        message={errorMessage || notice.message}
        variant={errorMessage ? "error" : notice.variant}
        onClose={() => {
          clearError();
          setNotice({ message: "", variant: "success" });
        }}
      />
    </>
  );
}
