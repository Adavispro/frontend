"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Power,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import ActionLabelTooltip from "@/components/table/ActionLabelTooltip";
import DataTable, {
  StatusPill,
  type DataTableColumn,
} from "@/components/table/DataTable";
import { FilterButton, Snackbar } from "@/components/ui";
import { ROUTES } from "@/config/routes";
import TopologyEsignModal from "@/features/master-management/plant-topology/components/TopologyEsignModal";
import { useTenants } from "../../tenant-management/hooks/useTenants";
import { usePlantTopology } from "../../plant-topology/hooks/usePlantTopology";
import { deleteDepartment, setDepartmentActive } from "../api";
import type { Department } from "../api/types";
import { useDepartments } from "../hooks/useDepartments";
import DepartmentFiltersPanel, {
  type DepartmentTableFilters,
} from "./DepartmentFiltersPanel";
import EditDepartmentDialog from "./EditDepartmentDialog";

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  tenant: string;
  plant: string;
  description: string;
  parent: string;
  status: "Active" | "Inactive";
  created: string;
  source: Department;
}

const PAGE_SIZE = 20;
const emptyFilters: DepartmentTableFilters = {
  parents: [],
  plants: [],
  statuses: [],
  tenants: [],
};

const countAppliedFilters = (filters: DepartmentTableFilters) =>
  filters.parents.length +
  filters.plants.length +
  filters.statuses.length +
  filters.tenants.length;

const uniqueValues = (values: string[]) =>
  Array.from(new Set(values.filter((value) => value && value !== "-"))).sort(
    (first, second) => first.localeCompare(second),
  );

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-GB").replaceAll("/", "-");
};

const toDepartmentRow = (
  department: Department,
  tenantNamesById: Record<string, string>,
  plantNamesById: Record<string, string>,
  departmentNamesById: Record<string, string>,
): DepartmentRow => ({
  id: department.departmentId,
  code: department.departmentCode ?? "-",
  name: department.departmentName || department.name,
  tenant: department.tenantId ? (tenantNamesById[department.tenantId] || department.tenantId) : "-",
  plant: department.plantId ? (plantNamesById[department.plantId] || department.plantId) : "-",
  description: department.description ?? "-",
  parent: department.parentDepartmentId ? (departmentNamesById[department.parentDepartmentId] || department.parentDepartmentId) : "-",
  status: department.isActive ? "Active" : "Inactive",
  created: formatDate(department.createdAt),
  source: department,
});

function DepartmentActions({
  department,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  department: Department;
  onEdit: (department: Department) => void;
  onStatusChange: (department: Department) => void;
  onDelete: (department: Department) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <ActionLabelTooltip label="Edit">
        <button
          type="button"
          aria-label="Edit department"
          disabled={!department.isActive}
          onClick={() => onEdit(department)}
          className="grid h-6 w-6 place-items-center rounded bg-[#E6F1FF] text-primary transition-colors hover:bg-[#D6E8FF] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <PencilSimple size={12} weight="regular" />
        </button>
      </ActionLabelTooltip>
      <ActionLabelTooltip label={department.isActive ? "Deactivate" : "Activate"}>
        <button
          type="button"
          aria-label={department.isActive ? "Deactivate department" : "Activate department"}
          onClick={() => onStatusChange(department)}
          className={`grid h-6 w-6 place-items-center rounded transition-colors ${department.isActive ? "bg-[#FFF0F0] text-danger" : "bg-[#E7F7EE] text-success"}`}
        >
          <Power size={12} weight="regular" />
        </button>
      </ActionLabelTooltip>
      <ActionLabelTooltip label="Delete">
        <button
          type="button"
          aria-label="Delete department"
          onClick={() => onDelete(department)}
          className="grid h-6 w-6 place-items-center rounded bg-[#FFF0F0] text-danger transition-colors hover:bg-[#FFE0E0]"
        >
          <Trash size={12} weight="regular" />
        </button>
      </ActionLabelTooltip>
    </div>
  );
}

const createColumns = (
  onEdit: (department: Department) => void,
  onStatusChange: (department: Department) => void,
  onDelete: (department: Department) => void,
): DataTableColumn<DepartmentRow>[] => [
  { key: "serialNumber", header: "S No.", render: (_row, index) => index + 1 },
  { key: "name", header: "Department Name", render: (row) => row.name },
  { key: "code", header: "Department Code", render: (row) => row.code },
  { key: "parent", header: "Parent Department", render: (row) => row.parent },
  { key: "tenant", header: "Tenant Name", render: (row) => row.tenant },
  { key: "plant", header: "Plant Name", render: (row) => row.plant },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <StatusPill
        label={row.status}
        className={
          row.status === "Active"
            ? "bg-[#DDF6DF] text-[#158047]"
            : "bg-[#EBEEF2] text-text-secondary"
        }
      />
    ),
  },
  { key: "created", header: "Created", render: (row) => row.created },
  {
    key: "actions",
    header: "Actions",
    render: (row) => (
      <DepartmentActions
        department={row.source}
        onEdit={onEdit}
        onStatusChange={onStatusChange}
        onDelete={onDelete}
      />
    ),
    disableRowLink: true,
  },
];

function DepartmentsToolbar({
  appliedFilterCount,
  onFilterClick,
  search,
  onSearchChange,
}: {
  appliedFilterCount: number;
  onFilterClick: () => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="module-glass-control hidden h-8 w-[310px] items-center gap-2 rounded-[4px] px-3 text-text-secondary md:flex">
        <MagnifyingGlass size={14} />
        <span className="sr-only">Search departments</span>
        <input
          type="search"
          placeholder="Search Departments"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="type-filter-value min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-secondary"
        />
      </label>

      <FilterButton
        appliedCount={appliedFilterCount}
        onClick={onFilterClick}
      />

      <Link
        href={ROUTES.masterCreateDepartment}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[4px] bg-primary px-4 text-[10px] font-semibold text-white shadow-[0_8px_18px_rgba(7,92,175,0.18)] transition-colors hover:bg-primary-hover"
      >
        <Plus size={13} weight="bold" />
        Create Department
      </Link>
    </div>
  );
}

export default function DepartmentsTable() {
  const [search, setSearch] = useState("");
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] =
    useState<DepartmentTableFilters>(emptyFilters);
  const [draftFilters, setDraftFilters] =
    useState<DepartmentTableFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [editingDepartment, setEditingDepartment] =
    useState<Department | null>(null);
  const [statusTarget, setStatusTarget] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [esignError, setEsignError] = useState("");
  const [operationNotification, setOperationNotification] = useState({
    message: "",
    variant: "success" as "error" | "success",
  });
  const {
    clearError,
    departments,
    errorMessage,
    isLoading,
    replaceDepartment,
  } = useDepartments();
  const { tenants } = useTenants();
  const { data: topology } = usePlantTopology();

  const tenantNamesById = useMemo(
    () =>
      Object.fromEntries(
        tenants.map((tenant) => [
          tenant.tenantId,
          tenant.companyName || tenant.tenantId,
        ]),
      ),
    [tenants],
  );

  const plantNamesById = useMemo(
    () =>
      Object.fromEntries(
        topology.plants.map((plant) => [
          plant.plantId,
          plant.plantName || plant.plantCode || plant.plantId,
        ]),
      ),
    [topology.plants],
  );

  const departmentNamesById = useMemo(
    () =>
      Object.fromEntries(
        departments.map((department) => [
          department.departmentId,
          department.departmentName || department.name || department.departmentId,
        ]),
      ),
    [departments],
  );
  const columns = useMemo(
    () => createColumns(setEditingDepartment, setStatusTarget, setDeleteTarget),
    [],
  );
  const allRows = useMemo(
    () =>
      departments.map((department) =>
        toDepartmentRow(
          department,
          tenantNamesById,
          plantNamesById,
          departmentNamesById,
        ),
      ),
    [departmentNamesById, departments, plantNamesById, tenantNamesById],
  );
  const filterOptions = useMemo(
    () => ({
      parents: uniqueValues(allRows.map((department) => department.parent)),
      plants: uniqueValues(allRows.map((department) => department.plant)),
      statuses: ["Active", "Inactive"],
      tenants: uniqueValues(allRows.map((department) => department.tenant)),
    }),
    [allRows],
  );
  const appliedFilterCount = countAppliedFilters(appliedFilters);
  const filteredRows = useMemo(() => {
    const rows = allRows
      .filter((department) =>
        appliedFilters.tenants.length > 0
          ? appliedFilters.tenants.includes(department.tenant)
          : true,
      )
      .filter((department) =>
        appliedFilters.plants.length > 0
          ? appliedFilters.plants.includes(department.plant)
          : true,
      )
      .filter((department) =>
        appliedFilters.parents.length > 0
          ? appliedFilters.parents.includes(department.parent)
          : true,
      )
      .filter((department) =>
        appliedFilters.statuses.length > 0
          ? appliedFilters.statuses.includes(department.status)
          : true,
      );
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) return rows;

    return rows.filter((department) =>
      [
        department.id,
        department.code,
        department.name,
        department.tenant,
        department.plant,
        department.description,
        department.parent,
      ].some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
  }, [allRows, appliedFilters, search]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const firstIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleRows = filteredRows.slice(firstIndex, firstIndex + PAGE_SIZE);
  const firstEntry = filteredRows.length === 0 ? 0 : firstIndex + 1;
  const lastEntry = Math.min(firstIndex + PAGE_SIZE, filteredRows.length);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleOpenFilters = () => {
    setDraftFilters(appliedFilters);
    setIsFilterPanelOpen(true);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(1);
    setIsFilterPanelOpen(false);
  };

  const handleClearFilters = () => {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  };

  const handleStatusChange = async (auth: { remarks: string; password: string }) => {
    if (!statusTarget) return;

    setIsChangingStatus(true);
    setEsignError("");
    setOperationNotification({ message: "", variant: "success" });

    try {
      const updated = await setDepartmentActive(statusTarget, !statusTarget.isActive, auth);
      replaceDepartment(updated);
      setStatusTarget(null);
      setOperationNotification({
        message: `Department ${statusTarget.isActive ? "deactivated" : "activated"} successfully.`,
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update department status. Please check your credentials.";
      setEsignError(message);
      setOperationNotification({
        message,
        variant: "error",
      });
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleDelete = async (auth: { remarks: string; password: string }) => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setEsignError("");
    setOperationNotification({ message: "", variant: "success" });

    try {
      await deleteDepartment(deleteTarget.departmentId, auth);
      replaceDepartment({ ...deleteTarget, isActive: false });
      setDeleteTarget(null);
      setOperationNotification({
        message: "Department deleted successfully.",
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to delete department. Please check your credentials.";
      setEsignError(message);
      setOperationNotification({
        message,
        variant: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DataTable
        title="Departments"
        columns={columns}
        rows={filteredRows}
        getRowKey={(row) => row.id}
        showPagination
        pageSize={10}
        pageSizeOptions={[10, 20, 30]}
        toolbar={
          <DepartmentsToolbar
            appliedFilterCount={appliedFilterCount}
            search={search}
            onFilterClick={handleOpenFilters}
            onSearchChange={handleSearchChange}
          />
        }
        emptyText={isLoading ? "Loading departments..." : "No departments found."}
      />

      <DepartmentFiltersPanel
        isOpen={isFilterPanelOpen}
        draftFilters={draftFilters}
        parentOptions={filterOptions.parents}
        plantOptions={filterOptions.plants}
        statusOptions={filterOptions.statuses}
        tenantOptions={filterOptions.tenants}
        onDraftChange={setDraftFilters}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        onClose={() => setIsFilterPanelOpen(false)}
      />

      <Snackbar
        open={Boolean(errorMessage)}
        variant="error"
        title="Unable to load departments"
        message={errorMessage}
        onClose={clearError}
      />

      <TopologyEsignModal
        isOpen={Boolean(statusTarget)}
        title={`${statusTarget?.isActive ? "Deactivate" : "Activate"} Department: ${statusTarget?.departmentCode || statusTarget?.departmentId || ""}`}
        actionLabel={`Sign & ${statusTarget?.isActive ? "Deactivate" : "Activate"}`}
        description="21 CFR Part 11 electronic signature authentication is required to change department lifecycle status. Enter your signature remarks and password."
        isSubmitting={isChangingStatus}
        errorMessage={esignError}
        onConfirm={handleStatusChange}
        onClose={() => {
          if (!isChangingStatus) {
            setStatusTarget(null);
            setEsignError("");
          }
        }}
      />

      <TopologyEsignModal
        isOpen={Boolean(deleteTarget)}
        title={`Delete Department: ${deleteTarget?.departmentCode || deleteTarget?.departmentId || ""}`}
        actionLabel="Sign & Delete Department"
        description="21 CFR Part 11 electronic signature authentication is required to delete department master data. Enter your signature remarks and password."
        isSubmitting={isDeleting}
        errorMessage={esignError}
        onConfirm={handleDelete}
        onClose={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
            setEsignError("");
          }
        }}
      />

      {editingDepartment ? (
        <EditDepartmentDialog
          key={editingDepartment.departmentId}
          department={editingDepartment}
          departments={departments}
          onClose={() => setEditingDepartment(null)}
          onUpdated={replaceDepartment}
        />
      ) : null}

      <Snackbar
        open={Boolean(operationNotification.message)}
        variant={operationNotification.variant}
        title={
          operationNotification.variant === "success"
            ? "Department updated"
            : "Unable to update department"
        }
        message={operationNotification.message}
        onClose={() =>
          setOperationNotification({ message: "", variant: "success" })
        }
      />
    </>
  );
}
