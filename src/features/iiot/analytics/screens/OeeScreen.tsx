"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  ChartBar,
  Clock,
  Factory,
  Funnel,
  ListNumbers,
  Plus,
  Sliders,
  WarningCircle,
  Wrench,
  X,
} from "@phosphor-icons/react";
import {
  calculatePharmaOee,
  PLANNED_DOWNTIME_CATEGORIES,
  UNPLANNED_DOWNTIME_CATEGORIES,
  type DowntimeRecord,
  type EquipmentOeeResult,
  type OeeSettings,
  localDate,
  parseLocalDate,
  scopeKey,
  productionDate,
} from "../utils/oee-engine";
import type { OeeWorkerRequest, OeeWorkerResponse } from "../utils/oee-worker";
import { buildOeeData } from "../utils/oee-data";
import { attachOeeEvidence } from "../utils/oee-evidence";
import { getOeeInputs, addOeeDowntime, updateOeeDowntime, deleteOeeDowntime } from "../api/oee.api";
import OeeSettingsDialog from "../components/OeeSettingsDialog";
import OeeDowntimeImportDialog from "../components/OeeDowntimeImportDialog";
import OeeSettingsImportDialog from "../components/OeeSettingsImportDialog";
import { getIiotAssets } from "@/features/master-management/iiot-master/api/iiotMaster.api";
import type { IiotAsset } from "@/features/master-management/iiot-master/api/types";
import { getEquipmentLiveStatuses, getBatchSummaryPaginated, getCppDataPaginated, getCriticalParameterLimits } from "@/features/iiot/equipment/api/reports.api";
import type { BatchSummary, EquipmentLiveStatus, CppRecord, CriticalParameterLimit } from "@/features/iiot/equipment/schemas/reports.schema";
import { getTenants } from "@/features/master-management/tenant-management/api/tenants.api";
import { getTopologyRecords } from "@/features/master-management/plant-topology/api/topology.api";

export interface TenantFilterOption {
  tenantId: string;
  companyName: string;
  companyCode?: string;
}

export interface PlantFilterOption {
  plantId: string;
  plantName: string;
  plantCode?: string;
  tenantId?: string;
}

export default function OeeScreen() {
  // Filter States
  const [dateRange, setDateRange] = useState<string>("Last 7 Days");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>("ALL");
  const [selectedPlantFilter, setSelectedPlantFilter] = useState<string>("ALL");
  const [selectedEquipmentFilter, setSelectedEquipmentFilter] = useState<string>("ALL");
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>("ALL");
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<"ALL" | "Shift 1" | "Shift 2" | "Shift 3">("ALL");

  // Dynamic Tenants & Plants from API / Topology
  const [liveTenants, setLiveTenants] = useState<TenantFilterOption[]>([]);
  const [livePlants, setLivePlants] = useState<PlantFilterOption[]>([]);

  // Planned Downtime Schedule state
  const [downtimeRecords, setDowntimeRecords] = useState<DowntimeRecord[]>([]);
  const [settings, setSettings] = useState<OeeSettings[]>([]);
  const upsertSettings = (value: OeeSettings) => setSettings(current => [...current.filter(s =>
    scopeKey(s.tenantId, s.plantId, s.equipmentId) !== scopeKey(value.tenantId, value.plantId, value.equipmentId)), value]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputError, setInputError] = useState("");
  const [downtimeError, setDowntimeError] = useState("");
  const [isSavingDowntime, setIsSavingDowntime] = useState(false);
  const [isAddDowntimeModalOpen, setIsAddDowntimeModalOpen] = useState(false);
  const [isDowntimeDrawerOpen, setIsDowntimeDrawerOpen] = useState(false);
  const [isDowntimeImportOpen, setIsDowntimeImportOpen] = useState(false);
  const [isSettingsImportOpen, setIsSettingsImportOpen] = useState(false);
  const [editingDowntimeId, setEditingDowntimeId] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState("");
  const [deletingDowntimeId, setDeletingDowntimeId] = useState<string | null>(null);

  // New planned downtime form state
  const [newDtEquipment, setNewDtEquipment] = useState<string>("");
  const [newDtDate, setNewDtDate] = useState<string>(localDate(new Date()));
  const [newDtStartTime, setNewDtStartTime] = useState<string>("08:00");
  const [newDtEndTime, setNewDtEndTime] = useState<string>("09:30");
  const [newDtCategory, setNewDtCategory] = useState<string>("Cleaning");
  const [newDtClassification, setNewDtClassification] = useState<"PLANNED" | "UNPLANNED">("PLANNED");
  const [newDtReason, setNewDtReason] = useState<string>("");
  const [newDtComments, setNewDtComments] = useState<string>("");
  const [newDtTimeZone, setNewDtTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Drilldown Modal
  const [selectedDrilldownEquipment, setSelectedDrilldownEquipment] = useState<EquipmentOeeResult | null>(null);

  // Live Batch Summaries & Equipment from API
  const [liveBatches, setLiveBatches] = useState<BatchSummary[]>([]);
  const [assets, setAssets] = useState<IiotAsset[]>([]);
  const [statuses, setStatuses] = useState<EquipmentLiveStatus[]>([]);
  const [cppRecords, setCppRecords] = useState<CppRecord[]>([]);
  const [cppLimits, setCppLimits] = useState<CriticalParameterLimit[]>([]);
  const [evidenceError, setEvidenceError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [calculationNow, setCalculationNow] = useState(() => new Date());

  useEffect(() => {
    const controller = new AbortController();
    const sourceRequest = Promise.all([
      getBatchSummaryPaginated({}, controller.signal, { limit: 500, maxPages: 1000, requireComplete: true, skipPlantSelection: true }),
      getTenants(true, controller.signal),
      getTopologyRecords("plants", true, controller.signal, { skipPlantSelection: true }),
      getIiotAssets(controller.signal),
      getEquipmentLiveStatuses({}, controller.signal, { skipPlantSelection: true }),
    ])
      .then(async ([batches, tenants, plants, equipment, liveStatuses]) => {
        if (controller.signal.aborted) return;
        setLiveBatches(batches);
        setAssets(equipment);
        setStatuses(liveStatuses);
        setCalculationNow(new Date());
        const data = buildOeeData(equipment, liveStatuses, batches);
        setSelectedEquipmentFilter(current => current === "ALL" || data.equipment.some(eq => eq.id === current) ? current : "ALL");
        setSelectedProductFilter(current => current === "ALL" || data.batches.some(b => b.productCode.toUpperCase() === current) ? current : "ALL");
        setSelectedTenantFilter(current => current === "ALL" || tenants.some(t => t.tenantId === current)
          || equipment.some(eq => eq.tenantId === current) ? current : "ALL");
        setSelectedPlantFilter(current => current === "ALL" || plants.some(p => p.plantId === current)
          || equipment.some(eq => eq.plantId === current) ? current : "ALL");
        setLiveTenants(tenants.map((t) => ({
            tenantId: t.tenantId,
            companyName: t.companyName || t.tenantId,
            companyCode: t.companyCode,
          })));
        setLivePlants(plants.map((p) => ({
            plantId: p.plantId,
            plantName: p.plantName || p.plantCode || p.plantId,
            plantCode: p.plantCode,
            tenantId: p.tenantId,
          })));
        try {
          const [records, limits] = await Promise.all([
            Promise.all(data.equipment.map(eq => getCppDataPaginated(eq.code,
              { tenantId: eq.tenantId, plantId: eq.plantId }, controller.signal,
              { limit: 500, maxPages: 1000, requireComplete: true, skipPlantSelection: true }))),
            getCriticalParameterLimits({}, controller.signal, { skipPlantSelection: true }),
          ]);
          if (!controller.signal.aborted) {
            setCppRecords(records.flat());
            setCppLimits(limits);
            setEvidenceError("");
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            setCppRecords([]);
            setCppLimits([]);
            setEvidenceError(err instanceof Error ? err.message : "Unable to load CPP calculation evidence.");
          }
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLiveBatches([]);
        setAssets([]);
        setLoadError(err instanceof Error ? err.message : "Unable to load OEE source data.");
      });
    const inputRequest = getOeeInputs(controller.signal).then(inputs => {
      if (controller.signal.aborted) return;
      setSettings(inputs.settings);
      setDowntimeRecords(inputs.downtime);
      setInputError("");
    }).catch(err => {
      if (!controller.signal.aborted) {
        setSettings([]);
        setDowntimeRecords([]);
        setInputError(err instanceof Error ? err.message : "Unable to load saved OEE inputs.");
      }
    });
    Promise.all([sourceRequest, inputRequest]).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false);
    });

    return () => controller.abort();
  }, [reloadKey]);

  const sourceData = useMemo(() => {
    const data = buildOeeData(assets, statuses, liveBatches);
    return { ...data, batches: attachOeeEvidence(data.batches, data.equipment, cppRecords, cppLimits) };
  }, [assets, statuses, liveBatches, cppRecords, cppLimits]);

  // Merged Tenants List
  const availableTenants = useMemo<TenantFilterOption[]>(() => {
    const map = new Map<string, TenantFilterOption>();
    map.set("ALL", { tenantId: "ALL", companyName: "All Tenants", companyCode: "ALL" });
    liveTenants.forEach((t) => {
      if (t.tenantId !== "ALL") map.set(t.tenantId, t);
    });
    assets.forEach(asset => {
      if (asset.tenantId && !map.has(asset.tenantId)) map.set(asset.tenantId, { tenantId: asset.tenantId, companyName: asset.tenantId });
    });
    return Array.from(map.values());
  }, [liveTenants, assets]);

  // Cascading Plants List based on selected Tenant
  const availablePlants = useMemo<PlantFilterOption[]>(() => {
    const map = new Map<string, PlantFilterOption>();
    map.set("ALL", { plantId: "ALL", plantName: "All Plants", plantCode: "ALL", tenantId: "ALL" });

    const combined = livePlants;
    combined.forEach((p) => {
      if (!map.has(p.plantId)) {
        map.set(p.plantId, p);
      }
    });
    assets.forEach(asset => {
      if (asset.plantId && !map.has(asset.plantId)) map.set(asset.plantId, { plantId: asset.plantId, plantName: asset.plantId, tenantId: asset.tenantId });
    });

    const all = Array.from(map.values());
    if (selectedTenantFilter === "ALL") {
      return all;
    }

    return all.filter(
      (p) => p.plantId === "ALL" || p.tenantId === selectedTenantFilter
    );
  }, [livePlants, assets, selectedTenantFilter]);

  // Cascading Equipment Options based on selected Tenant and Plant
  const availableEquipmentOptions = useMemo(() => {
    let list = sourceData.equipment;
    if (selectedTenantFilter !== "ALL") {
      list = list.filter((eq) => eq.tenantId === selectedTenantFilter);
    }
    if (selectedPlantFilter !== "ALL") {
      list = list.filter((eq) => eq.plantId === selectedPlantFilter);
    }
    return list;
  }, [sourceData.equipment, selectedTenantFilter, selectedPlantFilter]);

  const handleTenantChange = (tenantId: string) => {
    setSelectedTenantFilter(tenantId);
    setSelectedPlantFilter("ALL");
    setSelectedEquipmentFilter("ALL");
    setSelectedProductFilter("ALL");
  };

  const handlePlantChange = (plantId: string) => {
    setSelectedPlantFilter(plantId);
    // If plant belongs to a specific tenant, ensure tenant filter aligns
    if (plantId !== "ALL" && selectedTenantFilter === "ALL") {
      const plantObj = availablePlants.find((p) => p.plantId === plantId);
      if (plantObj && plantObj.tenantId && plantObj.tenantId !== "ALL") {
        setSelectedTenantFilter(plantObj.tenantId);
      }
    }
    setSelectedEquipmentFilter("ALL");
    setSelectedProductFilter("ALL");
  };

  const dateBounds = useMemo(() => {
    if (dateRange === "Specific Range") {
      const from = parseLocalDate(customStartDate), to = parseLocalDate(customEndDate);
      return from && to && from <= to && (to.getTime() - from.getTime()) / 86_400_000 < 366
        ? { fromDate: customStartDate, toDate: customEndDate } : null;
    }
    const days = dateRange === "Today" ? 1 : dateRange === "Last 1 Month" ? 30 : dateRange === "Last 3 Months" ? 90 : 7;
    const config = settings.find(s => scopeKey(s.tenantId, s.plantId, s.equipmentId) === selectedEquipmentFilter);
    const end = parseLocalDate(productionDate(calculationNow, config?.timeZone))!;
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    return { fromDate: localDate(start), toDate: localDate(end) };
  }, [dateRange, customStartDate, customEndDate, calculationNow, settings, selectedEquipmentFilter]);

  // Active Equipment List for OEE calculation
  const activeEquipmentList = useMemo(() => {
    return selectedEquipmentFilter === "ALL" ? availableEquipmentOptions
      : availableEquipmentOptions.filter(eq => eq.id === selectedEquipmentFilter);
  }, [availableEquipmentOptions, selectedEquipmentFilter]);

  const productOptions = useMemo(() => {
    const ids = new Set(activeEquipmentList.map(eq => eq.id));
    const products = new Map<string, string>();
    for (const batch of sourceData.batches) {
      if (!ids.has(batch.equipmentId) || !batch.productCode) continue;
      const code = batch.productCode.toUpperCase();
      const name = liveBatches.find(b => b.productCode?.toUpperCase() === code)?.productName;
      products.set(code, name ? `${name} (${code})` : code);
    }
    return Array.from(products, ([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sourceData.batches, activeEquipmentList, liveBatches]);
  const allProductOptions = useMemo(() => {
    const products = new Map<string, string>();
    for (const batch of sourceData.batches) {
      if (!batch.productCode) continue;
      const code = batch.productCode.toUpperCase();
      if (products.has(code)) continue;
      const name = liveBatches.find(b => b.productCode?.toUpperCase() === code)?.productName;
      products.set(code, name ? `${name} (${code})` : code);
    }
    return Array.from(products, ([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sourceData.batches, liveBatches]);
  const activeBatches = useMemo(() => {
    const ids = new Set(activeEquipmentList.map(eq => eq.id));
    return sourceData.batches.filter(b => ids.has(b.equipmentId)
      && (selectedProductFilter === "ALL" || b.productCode.toUpperCase() === selectedProductFilter));
  }, [sourceData.batches, activeEquipmentList, selectedProductFilter]);

  const workerRef = useRef<Worker | null>(null);
  const calculationId = useRef(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState("");
  const [dashboard, setDashboard] = useState(() => ({
    calculation: calculatePharmaOee({ equipmentList: [], batchList: [], downtimeRecords: [], settings: [],
      fromDate: "", toDate: "" }),
    trendPoints: [] as { label: string; oee: number | null }[],
    visibleDowntime: [] as DowntimeRecord[],
  }));
  useEffect(() => {
    const worker = new Worker(new URL("../utils/oee-worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<OeeWorkerResponse>) => {
      if (event.data.id !== calculationId.current) return;
      setIsCalculating(false);
      if ("error" in event.data) {
        setCalculationError(event.data.error);
      } else {
        setDashboard({ calculation: event.data.calculation, trendPoints: event.data.trendPoints,
          visibleDowntime: event.data.visibleDowntime });
        setCalculationError("");
      }
    };
    worker.onerror = () => {
      setIsCalculating(false);
      setCalculationError("Unable to run the OEE calculation worker. Refresh to retry.");
    };
    return () => { worker.terminate(); workerRef.current = null; };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    setIsCalculating(true);
    setCalculationError("");
    const request: OeeWorkerRequest = { id: ++calculationId.current, params: {
      equipmentList: activeEquipmentList,
      batchList: activeBatches,
      downtimeRecords,
      settings: inputError ? [] : settings,
      fromDate: dateBounds?.fromDate || "",
      toDate: dateBounds?.toDate || "",
      selectedShift: selectedShiftFilter,
      now: calculationNow,
    } };
    worker.postMessage(request);
  }, [activeEquipmentList, activeBatches, downtimeRecords, settings, inputError, dateBounds, selectedShiftFilter, calculationNow]);
  const { calculation: oeeCalculation, trendPoints, visibleDowntime } = dashboard;

  // Handle adding new planned downtime record
  const handleSaveDowntime = async (e: React.FormEvent) => {
    e.preventDefault();
    const eq = activeEquipmentList.find(item => item.id === newDtEquipment);
    setDowntimeError("");
    if (!eq || newDtStartTime === newDtEndTime || !newDtReason.trim()) {
      setDowntimeError("Select equipment, different start/end times, and a reason.");
      return;
    }
    setIsSavingDowntime(true);
    try {
      const input = {
        equipmentId: eq.code, tenantId: eq.tenantId, plantId: eq.plantId,
        date: newDtDate,
        startTime: newDtStartTime,
        endTime: newDtEndTime,
        reason: newDtReason.trim(),
        classification: newDtClassification,
        category: newDtCategory,
        comments: newDtComments.trim(),
        timeZone: newDtTimeZone,
      };
      if (editingDowntimeId) {
        const updated = await updateOeeDowntime(editingDowntimeId, input);
        setDowntimeRecords(prev => prev.map(dt => dt.id === editingDowntimeId ? updated : dt));
      } else {
        const newRecord = await addOeeDowntime(input);
        setDowntimeRecords((prev) => [newRecord, ...prev]);
      }
      setEditingDowntimeId(null);
      setIsAddDowntimeModalOpen(false);
      setNewDtReason("");
      setNewDtComments("");
    } catch (err) {
      setDowntimeError(err instanceof Error ? err.message : "Unable to save downtime.");
    } finally {
      setIsSavingDowntime(false);
    }
  };

  const metric = (value: number | null, suffix = "%") => value === null ? "Data unavailable" : `${value}${suffix}`;
  const availabilityMetric = (eq: EquipmentOeeResult) => eq.availabilityPercent !== null ? `${eq.availabilityPercent}%`
    : eq.scheduleCoveredDays === 0 ? "No schedule" : "Downtime not confirmed";
  const coverage = oeeCalculation.scheduleCoverage;
  const refresh = () => {
    setIsLoading(true);
    setLoadError("");
    setSelectedDrilldownEquipment(null);
    setReloadKey(key => key + 1);
  };
  const openDowntime = () => {
    setNewDtEquipment(activeEquipmentList[0]?.id || "");
    const eq = activeEquipmentList[0];
    setNewDtTimeZone(settings.find(s => eq && scopeKey(s.tenantId, s.plantId, s.equipmentId) === eq.id)?.timeZone
      || Intl.DateTimeFormat().resolvedOptions().timeZone);
    setDowntimeError("");
    setEditingDowntimeId(null);
    setIsAddDowntimeModalOpen(true);
  };
  const openEditDowntime = (dt: DowntimeRecord) => {
    setNewDtEquipment(scopeKey(dt.tenantId, dt.plantId, dt.equipmentId));
    setNewDtDate(dt.date);
    setNewDtStartTime(dt.startTime);
    setNewDtEndTime(dt.endTime);
    setNewDtClassification(dt.classification);
    setNewDtCategory(dt.category);
    setNewDtReason(dt.reason);
    setNewDtComments(dt.comments || "");
    setNewDtTimeZone(dt.timeZone);
    setDowntimeError("");
    setEditingDowntimeId(dt.id);
    setIsDowntimeDrawerOpen(false);
    setIsAddDowntimeModalOpen(true);
  };
  const handleDeleteDowntime = async (dt: DowntimeRecord) => {
    if (!window.confirm(`Delete ${dt.equipmentId} downtime on ${dt.date} ${dt.startTime}-${dt.endTime}?`)) return;
    setDrawerError("");
    setDeletingDowntimeId(dt.id);
    try {
      await deleteOeeDowntime(dt.id);
      setDowntimeRecords(prev => prev.filter(item => item.id !== dt.id));
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : "Unable to delete downtime.");
    } finally {
      setDeletingDowntimeId(null);
    }
  };
  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <ChartBar className="h-6 w-6" weight="duotone" />
            </span>
            Overall Equipment Effectiveness (OEE)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise Pharmaceutical Batch OEE &bull; Availability, Performance, Quality, Downtime & Shift Breakdown
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={refresh} disabled={isLoading}
            className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">Refresh</button>
          <button type="button" onClick={() => setIsSettingsOpen(true)} disabled={!activeEquipmentList.length || isLoading}
            className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">
            <Sliders className="h-4 w-4" />Configure OEE
          </button>
          <button
            type="button"
            onClick={() => setIsDowntimeDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            <Clock className="h-4 w-4 text-indigo-600" />
            <span>Downtime Log ({visibleDowntime.length})</span>
          </button>
          <button type="button" onClick={() => setIsDowntimeImportOpen(true)}
            disabled={!activeEquipmentList.length || Boolean(inputError)}
            className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">Import Downtime CSV</button>
          <button type="button" onClick={() => setIsSettingsImportOpen(true)}
            disabled={!activeEquipmentList.length || isLoading}
            className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50">Import Config CSV</button>

          <button
            type="button"
            onClick={openDowntime}
            disabled={!activeEquipmentList.length || Boolean(inputError)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Record Downtime</span>
          </button>
        </div>
      </div>

      {/* FILTER CONTROL CARD */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Funnel className="h-4 w-4 text-indigo-600" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              OEE Filters & Shift Scope
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {(selectedTenantFilter !== "ALL" ||
              selectedPlantFilter !== "ALL" ||
              selectedEquipmentFilter !== "ALL" ||
              selectedProductFilter !== "ALL" ||
              selectedShiftFilter !== "ALL" ||
              dateRange !== "Last 7 Days") && (
              <button
                type="button"
                onClick={() => {
                  setDateRange("Last 7 Days");
                  setCustomStartDate("");
                  setCustomEndDate("");
                  setSelectedTenantFilter("ALL");
                  setSelectedPlantFilter("ALL");
                  setSelectedEquipmentFilter("ALL");
                  setSelectedProductFilter("ALL");
                  setSelectedShiftFilter("ALL");
                }}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
              >
                Reset Filters
              </button>
            )}
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
              {oeeCalculation.estimated ? "Quality: source yield / CPP compliance / QA" : "Pharma Batch Quality: Good Batches ÷ Completed Batches"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Date Range */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Date Range
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              <option value="Today">Today</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="Last 1 Month">Last 1 Month</option>
              <option value="Last 3 Months">Last 3 Months</option>
              <option value="Specific Range">Specific Date Range</option>
            </select>
            {dateRange === "Specific Range" && (
              <div className="flex items-center gap-1 mt-1.5">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-1/2 text-[10px] border border-slate-300 rounded p-1 font-mono"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-1/2 text-[10px] border border-slate-300 rounded p-1 font-mono"
                />
              </div>
            )}
          </div>

          {/* 2. Tenant Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Tenant
            </label>
            <select
              value={selectedTenantFilter}
              onChange={(e) => handleTenantChange(e.target.value)}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              {availableTenants.map((tenant) => (
                <option key={tenant.tenantId} value={tenant.tenantId}>
                  {tenant.tenantId === "ALL"
                    ? "All Tenants"
                    : `${tenant.companyName}${tenant.companyCode ? ` (${tenant.companyCode})` : ""}`}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Plant Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Plant
            </label>
            <select
              value={selectedPlantFilter}
              onChange={(e) => handlePlantChange(e.target.value)}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              {availablePlants.map((plant) => (
                <option key={plant.plantId} value={plant.plantId}>
                  {plant.plantId === "ALL"
                    ? `All Plants (${availablePlants.length - 1})`
                    : `${plant.plantName}${plant.plantCode ? ` [${plant.plantCode}]` : ""}`}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Equipment ID Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Equipment ID
            </label>
            <select
              value={selectedEquipmentFilter}
              onChange={(e) => {
                setSelectedEquipmentFilter(e.target.value);
                setSelectedProductFilter("ALL");
              }}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              <option value="ALL">All Equipment ({availableEquipmentOptions.length})</option>
              {availableEquipmentOptions.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Product (Optional) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Product (Optional)
            </label>
            <select
              value={selectedProductFilter}
              onChange={(e) => setSelectedProductFilter(e.target.value)}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              <option value="ALL">All Products ({productOptions.length})</option>
              {productOptions.map((prod) => (
                <option key={prod.code} value={prod.code}>
                  {prod.name}
                </option>
              ))}
            </select>
          </div>

          {/* 6. Shift Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Shift Scope
            </label>
            <select
              value={selectedShiftFilter}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "ALL" || value === "Shift 1" || value === "Shift 2" || value === "Shift 3") setSelectedShiftFilter(value);
              }}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              <option value="ALL">All configured shifts</option>
              <option value="Shift 1">Shift 1 (06:00 - 14:00)</option>
              <option value="Shift 2">Shift 2 (14:00 - 22:00)</option>
              <option value="Shift 3">Shift 3 (22:00 - 06:00 Overnight)</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Production dates run 06:00 to 06:00 the next day in the saved plant timezone. Overnight Shift 3 belongs to its starting date.
          Completed counts represent equipment batch/lot executions, not distinct end-to-end manufacturing batches.
          Product filters apply to performance and quality; availability and downtime remain equipment-wide.
        </p>
      </div>
      {isLoading && <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">Loading OEE source data...</p>}
      {loadError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{loadError} Use Refresh to retry.</p>}
      {inputError && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{inputError} Availability and OEE are unavailable until saved inputs can be loaded.</p>}
      {!dateBounds && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Select a valid start and end date (maximum 366 production days).</p>}
      {!isLoading && !loadError && !activeEquipmentList.length && <p className="rounded-xl bg-slate-50 p-4 text-sm">No active equipment matches the selected tenant and plant.</p>}
      {sourceData.unmappedExecutions > 0 && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">
        {sourceData.unmappedExecutions} executed stages have missing or ambiguous equipment scope and were excluded. Correct their master-data association before using OEE as a complete plant total.
      </p>}

      {isCalculating && !isLoading && <p role="status" className="text-xs text-slate-500">Updating OEE calculations...</p>}
      {calculationError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{calculationError}</p>}
      {!isLoading && !isCalculating && !calculationError && !loadError && dateBounds && activeEquipmentList.length > 0 && <>
      {evidenceError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
        CPP evidence unavailable: {evidenceError}. CPP-based quality cannot be calculated.
      </p>}
      {oeeCalculation.estimated && <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold">Estimated OEE · Calculation details</summary>
        <p>Performance uses configured ideals where available; otherwise compression report output/rate/runtime or
          other-execution median durations. Mixed-product equipment baselines are explicitly identified.
          Quality uses final manufacturing outcomes where available, otherwise tablet yield or recorded CPP
          compliance against effective critical limits. Missing parameters are excluded; shutdown readings may be included.
          Quality is averaged per execution, not pooled across incompatible units. QA approvals are unchanged.</p>
        {oeeCalculation.equipmentWise.filter(eq => eq.estimated).map(eq =>
          <p key={eq.scopeKey} className="mt-1"><strong>{eq.equipmentId}:</strong> {eq.calculationBasis}</p>)}
      </details>}
      {oeeCalculation.overallOeePercent === null && <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold">Incomplete calculation inputs · Details</summary>
        <p>
        OEE requires a saved schedule covering the entire selected period, a confirmed complete downtime log,
        performance evidence for every completed execution, and quality evidence.
        Estimates use only measured source data and other executions; missing evidence remains unavailable.
        Configure validated ideal durations and record final QA outcomes to replace estimates.
        </p>
      </details>}
      {/* PLANT / OVERALL OEE KPI CARDS (Point 10 & 11) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: OVERALL OEE */}
        <div className="bg-gradient-to-br from-indigo-900 to-indigo-700 text-white rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between text-indigo-200 text-xs font-semibold">
              <span>{oeeCalculation.estimated ? "Estimated Plant OEE" : "Overall Plant OEE"}</span>
              <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded-full border border-white/10">
                A × P × Q
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              {oeeCalculation.overallOeePercent !== null ? (
                <strong className="text-4xl font-extrabold font-mono tracking-tight text-white">
                  {oeeCalculation.overallOeePercent}%
                </strong>
              ) : (
                <span className="text-xl font-bold font-sans text-amber-200">
                  Incomplete Data
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-indigo-400/30 flex items-center justify-between text-[11px]">
            <span className="text-indigo-200">Formula:</span>
            <span className="font-mono text-indigo-100 font-semibold">
              {metric(oeeCalculation.availabilityPercent)} × {metric(oeeCalculation.performancePercent)} × {metric(oeeCalculation.qualityPercent)}
            </span>
          </div>
        </div>

        {/* CARD 2: AVAILABILITY */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>Availability</span>
              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                Operating ÷ Planned
              </span>
            </div>
            <div className="mt-3">
              <strong className="text-3xl font-extrabold font-mono text-slate-900">
                {metric(oeeCalculation.availabilityPercent)}
              </strong>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            <span>Operating Time:</span>
            <span className="font-bold text-slate-700">
              {metric(oeeCalculation.totalOperatingHours, "h")} / {metric(oeeCalculation.totalScheduledHours === null ? null
                : Number((oeeCalculation.totalScheduledHours - oeeCalculation.totalPlannedDowntimeHours).toFixed(2)), "h")}
            </span>
          </div>
          {coverage && coverage.rangeDays > 0 && <p className="mt-2 text-[10px] text-slate-500">
            {coverage.availabilityEquipment
              ? `Based on ${coverage.availabilityEquipment} of ${coverage.totalEquipment} equipment · up to ${coverage.coveredDays} of ${coverage.rangeDays} days have a saved schedule. Unscheduled days are excluded, not counted as lost time.`
              : coverage.scheduledEquipment
                ? "A schedule exists, but no equipment has confirmed complete downtime for this range (Configure OEE, step 5)."
                : `No saved schedule overlaps these ${coverage.rangeDays} day(s). Use Configure OEE to add one.`}
          </p>}
        </div>

        {/* CARD 3: PERFORMANCE */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>Performance</span>
              <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200 font-bold">
                Ideal ÷ Actual
              </span>
            </div>
            <div className="mt-3">
              {oeeCalculation.performancePercent !== null ? (
                <strong className="text-3xl font-extrabold font-mono text-slate-900">
                  {oeeCalculation.performancePercent}%
                </strong>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  <WarningCircle className="h-3.5 w-3.5 text-amber-600" />
                  Configuration Required
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Recipe Ideal Time:</span>
            <span className="font-mono font-bold text-slate-700">
              {oeeCalculation.performanceStatus === "AVAILABLE" ? (oeeCalculation.estimated ? "Source / Historical Estimate" : "Master Data Configured") : "Baseline / Ideal Required"}
            </span>
          </div>
        </div>

        {/* CARD 4: QUALITY */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>{oeeCalculation.estimated ? "Quality Indicator (Estimated)" : "Quality (Batch Level)"}</span>
              <span className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 font-bold">
                {oeeCalculation.estimated ? "Yield / CPP / QA" : "Good ÷ Completed"}
              </span>
            </div>
            <div className="mt-3">
              {oeeCalculation.qualityPercent !== null ? (
                <strong className="text-3xl font-extrabold font-mono text-slate-900">
                  {oeeCalculation.qualityPercent}%
                </strong>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  <WarningCircle className="h-3.5 w-3.5 text-amber-600" />
                  Data Unavailable
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            <span>Good / Completed:</span>
            <span className="font-bold text-slate-700">
              {oeeCalculation.totalGoodReleasedBatches} / {oeeCalculation.totalCompletedBatches} Batches
            </span>
          </div>
        </div>
      </div>

      {/* SECONDARY PLANT OPERATIONAL EFFICIENCY METRICS (Point 11 & 15) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Factory className="h-4 w-4 text-indigo-600" />
              Plant Operational Efficiency & Utilization
            </h3>
            <p className="text-[11px] text-slate-400">
              Distinct operational metrics clearly separated from standard OEE calculation
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Equipment Utilization
            </span>
            <span className="text-base font-extrabold font-mono text-indigo-600 block mt-1">
              {metric(oeeCalculation.equipmentUtilizationPercent)}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">Operating ÷ Scheduled time</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Completed Batches
            </span>
            <span className="text-base font-extrabold font-mono text-slate-800 block mt-1">
              {oeeCalculation.totalCompletedBatches}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">Total Finished</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Good / Released
            </span>
            <span className="text-base font-extrabold font-mono text-emerald-600 block mt-1">
              {oeeCalculation.totalGoodReleasedBatches}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">Passed QA Release</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Rejected / Failed
            </span>
            <span className="text-base font-extrabold font-mono text-rose-600 block mt-1">
              {oeeCalculation.totalRejectedFailedBatches}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">Deviations / Failed</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Operating Time
            </span>
            <span className="text-base font-extrabold font-mono text-slate-800 block mt-1">
              {metric(oeeCalculation.totalOperatingHours, "h")}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">Schedule minus confirmed downtime</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Planned Downtime
            </span>
            <span className="text-base font-extrabold font-mono text-indigo-600 block mt-1">
              {oeeCalculation.totalPlannedDowntimeHours}h
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">Scheduled Maintenance</span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Unplanned Downtime
            </span>
            <span className="text-base font-extrabold font-mono text-amber-600 block mt-1">
              {oeeCalculation.totalUnplannedDowntimeHours}h
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">Stoppages / Faults</span>
          </div>
        </div>
      </div>

      {/* SHIFT-WISE OEE ANALYSIS (Points 5 & 13) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" />
              Shift-Level OEE Analysis (Including Continuous Overnight Shift 3)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Shift 1 (06:00–14:00), Shift 2 (14:00–22:00), Shift 3 (22:00–06:00 overnight)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {oeeCalculation.shiftWise.map((shift) => (
            <div
              key={shift.shiftId}
              className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-white transition space-y-3 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{shift.shiftName}</h4>
                  <span className="text-[10px] font-mono text-slate-500">{metric(shift.scheduledHours, "h scheduled")}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold font-mono text-indigo-600 block">
                    {shift.oeePercent !== null ? `${shift.oeePercent}% OEE` : "Incomplete"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-200/80 text-[11px]">
                <div className="bg-white p-2 rounded-lg border border-slate-100">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Availability</span>
                  <strong className="font-mono text-slate-800">{metric(shift.availabilityPercent)}</strong>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-100">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Batches</span>
                  <strong className="font-mono text-slate-800">{shift.goodReleasedBatches}/{shift.completedBatches}</strong>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-100">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">Downtime</span>
                  <strong className="font-mono text-slate-800">{shift.plannedDowntimeHours + shift.unplannedDowntimeHours}h</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* EQUIPMENT-WISE OEE TABLE (Point 12) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ListNumbers className="h-4 w-4 text-indigo-600" />
              Equipment-Wise OEE & Metric Breakdown
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click an equipment row to drill down into its dedicated performance & downtime audit log
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3.5">Equipment ID</th>
                <th className="py-2.5 px-3.5 text-center">Status</th>
                <th className="py-2.5 px-3.5 text-right">Availability</th>
                <th className="py-2.5 px-3.5 text-right">Performance</th>
                <th className="py-2.5 px-3.5 text-right">Quality</th>
                <th className="py-2.5 px-3.5 text-right font-bold text-indigo-600">OEE %</th>
                <th className="py-2.5 px-3.5 text-right">Utilization</th>
                <th className="py-2.5 px-3.5 text-center">Batches (Good/Total)</th>
                <th className="py-2.5 px-3.5 text-right">Downtime (Plan/Unplan)</th>
                <th className="py-2.5 px-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {oeeCalculation.equipmentWise.map((eq) => (
                <tr
                  key={eq.scopeKey}
                  onClick={() => setSelectedDrilldownEquipment(eq)}
                  className="hover:bg-slate-50 transition cursor-pointer"
                >
                  <td className="py-3 px-3.5 font-bold text-slate-900">
                    <div>{eq.equipmentId}</div>
                    <div className="text-[10px] font-sans text-slate-400 font-normal">{eq.equipmentName}</div>
                  </td>
                  <td className="py-3 px-3.5 text-center font-sans">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        eq.status.toUpperCase() === "RUNNING"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : eq.status.toUpperCase() === "IDLE"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : ["FAULT", "ERROR", "ALARM"].includes(eq.status.toUpperCase())
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {eq.status}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-right font-bold text-slate-800">
                    {availabilityMetric(eq)}
                    {eq.availabilityPercent !== null && eq.scheduleCoveredDays < eq.rangeDays && <span
                      className="block text-[9px] font-normal text-slate-500">{eq.scheduleCoveredDays}/{eq.rangeDays} days scheduled</span>}
                  </td>
                  <td className="py-3 px-3.5 text-right">
                    {eq.performancePercent !== null ? (
                      <span className="font-bold text-slate-800">{eq.performancePercent}%</span>
                    ) : (
                      <span className="text-[10px] font-sans text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                        {eq.totalCompletedBatches === 0 ? "No Runs" : "Req. Config"}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3.5 text-right">
                    {eq.qualityPercent !== null ? (
                      <span className="font-bold text-slate-800">{eq.qualityPercent}%</span>
                    ) : (
                      <span className="text-[10px] font-sans text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        No Data
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3.5 text-right font-extrabold text-indigo-600 text-sm">
                    {eq.oeePercent !== null ? `${eq.oeePercent}%` : "Incomplete"}
                  </td>
                  <td className="py-3 px-3.5 text-right text-slate-600">
                    {metric(eq.equipmentUtilizationPercent)}
                  </td>
                  <td className="py-3 px-3.5 text-center text-slate-700">
                    {eq.goodReleasedBatches} / {eq.totalCompletedBatches}
                  </td>
                  <td className="py-3 px-3.5 text-right text-slate-600 text-[11px]">
                    {eq.plannedDowntimeHours}h / {eq.unplannedDowntimeHours}h
                  </td>
                  <td className="py-3 px-3.5 text-right font-sans">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDrilldownEquipment(eq);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                    >
                      Drill Down ›
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DOWNTIME ANALYSIS & BREAKDOWN (Point 14) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Downtime by Reason / Category Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Downtime Breakdown by Reason
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Planned vs Unplanned categorization
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-700">
              Total: {oeeCalculation.totalPlannedDowntimeHours + oeeCalculation.totalUnplannedDowntimeHours}h
            </span>
          </div>

          <div className="space-y-2.5">
            {oeeCalculation.downtimeSegments.map((seg) => (
              <div key={seg.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="font-semibold text-slate-800">{seg.label}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        seg.classification === "PLANNED"
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {seg.classification}
                    </span>
                  </div>
                  <div className="font-mono text-slate-700 font-bold">
                    {seg.hours}h ({seg.percent}%)
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, seg.percent)}%`,
                      backgroundColor: seg.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OEE Trend Graph Preview */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Daily OEE Trend
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Daily trend progression over selected range
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-bold text-indigo-600">
                <span className="h-2 w-2 rounded-full bg-indigo-600" /> OEE
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl p-2 bg-slate-900 text-white">
            <div className="h-44 flex items-end justify-between gap-2 px-2 pt-6 pb-2" style={{ minWidth: `${trendPoints.length * 40}px` }}>
              {trendPoints.map((pt, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative">
                  {pt.oee === null ? <span className="text-[9px] text-slate-400">No data</span> :
                    <div aria-label={`${pt.label}: ${pt.oee}% OEE`} className="w-full max-w-[28px] bg-indigo-500 rounded-t transition-all hover:bg-indigo-400"
                      style={{ height: `${(pt.oee / 100) * 120}px` }} />}
                  <span className="text-[9px] font-mono text-slate-400 rotate-[-45deg] origin-top-left mt-2">
                    {pt.label}
                  </span>
                  {/* Hover chip */}
                  <div className="opacity-0 group-hover:opacity-100 transition absolute bottom-full mb-1 z-10 bg-slate-800 text-[10px] font-mono p-1 rounded border border-slate-700 pointer-events-none whitespace-nowrap">
                    OEE: {pt.oee === null ? "No schedule/runs this day" : `${pt.oee}%`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      </>}
      {isDowntimeImportOpen && <OeeDowntimeImportDialog equipment={activeEquipmentList}
        onClose={() => setIsDowntimeImportOpen(false)}
        onImported={records => setDowntimeRecords(prev => [...records, ...prev])} />}
      {isSettingsOpen && <OeeSettingsDialog equipment={activeEquipmentList} settings={settings}
        products={allProductOptions} batches={sourceData.batches} fromDate={dateBounds?.fromDate || localDate(calculationNow)}
        toDate={dateBounds?.toDate || localDate(calculationNow)}
        onImportCsv={() => { setIsSettingsOpen(false); setIsSettingsImportOpen(true); }}
        onDeleted={value => {
          const key = scopeKey(value.tenantId, value.plantId, value.equipmentId);
          setSettings(current => current.filter(s => scopeKey(s.tenantId, s.plantId, s.equipmentId) !== key));
          refresh();
        }}
        onClose={() => setIsSettingsOpen(false)} onSaved={value => {
          upsertSettings(value);
          refresh();
        }} />}
      {isSettingsImportOpen && <OeeSettingsImportDialog equipment={activeEquipmentList} settings={settings}
        onSaved={upsertSettings}
        onClose={() => { setIsSettingsImportOpen(false); refresh(); }} />}
      {/* DRILLDOWN MODAL (Point 12) */}
      {selectedDrilldownEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <Factory className="h-5 w-5" />
                  </span>
                  <span>{selectedDrilldownEquipment.equipmentId} — OEE Detail Drilldown</span>
                </h3>
                <p className="text-xs text-slate-500">{selectedDrilldownEquipment.equipmentName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDrilldownEquipment(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-indigo-700 block">Equipment OEE</span>
                <strong className="text-2xl font-mono text-indigo-900 block mt-1">
                  {selectedDrilldownEquipment.oeePercent !== null ? `${selectedDrilldownEquipment.oeePercent}%` : "Incomplete"}
                </strong>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-600 block">Availability</span>
                <strong className="text-xl font-mono text-slate-900 block mt-1">
                  {availabilityMetric(selectedDrilldownEquipment)}
                </strong>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-600 block">Performance</span>
                <strong className="text-xl font-mono text-slate-900 block mt-1">
                  {selectedDrilldownEquipment.performancePercent !== null ? `${selectedDrilldownEquipment.performancePercent}%` : selectedDrilldownEquipment.totalCompletedBatches === 0 ? "No Runs" : "Req. Config"}
                </strong>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] uppercase font-bold text-slate-600 block">Quality</span>
                <strong className="text-xl font-mono text-slate-900 block mt-1">
                  {selectedDrilldownEquipment.qualityPercent !== null ? `${selectedDrilldownEquipment.qualityPercent}%` : "No Data"}
                </strong>
              </div>
            </div>

            <div className="space-y-2 text-xs border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
              <div className="flex justify-between py-1 border-b border-slate-200/60 font-mono">
                <span className="text-slate-600 font-sans">Operating Runtime:</span>
                <span className="font-bold text-slate-900">{metric(selectedDrilldownEquipment.operatingTimeHours, "h")}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60 font-mono">
                <span className="text-slate-600 font-sans">Planned Downtime:</span>
                <span className="font-bold text-indigo-700">{selectedDrilldownEquipment.plannedDowntimeHours} Hours</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60 font-mono">
                <span className="text-slate-600 font-sans">Unplanned Downtime:</span>
                <span className="font-bold text-amber-700">{selectedDrilldownEquipment.unplannedDowntimeHours} Hours</span>
              </div>
              <div className="flex justify-between py-1 font-mono">
                <span className="text-slate-600 font-sans">Completed Batches in Window:</span>
                <span className="font-bold text-slate-900">{selectedDrilldownEquipment.totalCompletedBatches} (Good: {selectedDrilldownEquipment.goodReleasedBatches}, Rej: {selectedDrilldownEquipment.rejectedFailedBatches})</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedDrilldownEquipment(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Close Drilldown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOWNTIME SCHEDULE DRAWER (Point 6) */}
      {isDowntimeDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-indigo-600" />
                    Downtime Schedule Registry
                  </h3>
                  <p className="text-xs text-slate-500">Planned Maintenance, Cleaning & Calibration Tracking</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDowntimeDrawerOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-medium">
                  {visibleDowntime.length} Downtime Entries for selected equipment and dates
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsDowntimeDrawerOpen(false);
                    openDowntime();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add New
                </button>
              </div>
              {drawerError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{drawerError}</p>}

              <div className="space-y-3">
                {!visibleDowntime.length && <p className="text-xs text-slate-500">No downtime recorded for this selection. An empty log is not treated as proof of zero downtime.</p>}
                {visibleDowntime.map((dt) => (
                  <div
                    key={dt.id}
                    className="p-3.5 border border-slate-200 rounded-xl bg-slate-50/60 hover:bg-white transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-mono font-bold">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900">{dt.equipmentId}</span>
                        <span className="text-slate-400 font-normal">|</span>
                        <span className="text-indigo-600">{dt.category}</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          dt.classification === "PLANNED"
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {dt.classification}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 font-medium">{dt.reason}</div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 font-mono">
                      <span>{dt.date} &bull; {dt.startTime} - {dt.endTime}</span>
                      <span className="font-bold text-slate-700">{dt.durationHours}h</span>
                    </div>

                    {dt.comments && (
                      <p className="text-[11px] text-slate-500 italic bg-white p-1.5 rounded border border-slate-100">
                        &quot;{dt.comments}&quot;
                      </p>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => openEditDowntime(dt)} disabled={deletingDowntimeId === dt.id}
                        className="rounded-md border px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Edit</button>
                      <button type="button" onClick={() => handleDeleteDowntime(dt)} disabled={deletingDowntimeId === dt.id}
                        className="rounded-md border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                        {deletingDowntimeId === dt.id ? "Deleting..." : "Delete"}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDowntimeDrawerOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD PLANNED DOWNTIME MODAL (Point 6) */}
      {isAddDowntimeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form
            onSubmit={handleSaveDowntime}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-indigo-600" />
                  {editingDowntimeId ? "Edit Downtime" : "Record Downtime"}
                </h3>
                <p className="text-xs text-slate-500">Record maintenance, cleaning, changeover or calibration</p>
              </div>
              {downtimeError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{downtimeError}</p>}
              <button
                type="button"
                onClick={() => setIsAddDowntimeModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Equipment
                </label>
                <select
                  value={newDtEquipment}
                  onChange={(e) => {
                    setNewDtEquipment(e.target.value);
                    setNewDtTimeZone(settings.find(s => scopeKey(s.tenantId, s.plantId, s.equipmentId) === e.target.value)?.timeZone
                      || Intl.DateTimeFormat().resolvedOptions().timeZone);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                >
                  {activeEquipmentList.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="block text-xs">Plant timezone
                <input required value={newDtTimeZone} onChange={e => setNewDtTimeZone(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2" placeholder="Asia/Kolkata" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Classification
                  </label>
                  <select
                    value={newDtClassification}
                    onChange={(e) => {
                      if (e.target.value === "PLANNED" || e.target.value === "UNPLANNED") {
                        setNewDtClassification(e.target.value);
                        setNewDtCategory(e.target.value === "PLANNED" ? PLANNED_DOWNTIME_CATEGORIES[0] : UNPLANNED_DOWNTIME_CATEGORIES[0]);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="PLANNED">Planned Downtime</option>
                    <option value="UNPLANNED">Unplanned Downtime</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Category / Reason Type
                  </label>
                  <select
                    value={newDtCategory}
                    onChange={(e) => setNewDtCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    {newDtClassification === "PLANNED"
                      ? PLANNED_DOWNTIME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)
                      : UNPLANNED_DOWNTIME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newDtDate}
                    onChange={(e) => setNewDtDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={newDtStartTime}
                    onChange={(e) => setNewDtStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={newDtEndTime}
                    onChange={(e) => setNewDtEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Reason / Description
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Semi-annual calibration of load cells & pressure gauges"
                  value={newDtReason}
                  onChange={(e) => setNewDtReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Comments / Maintenance Log Note
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional engineer or calibration reference ID..."
                  value={newDtComments}
                  onChange={(e) => setNewDtComments(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddDowntimeModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingDowntime}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer shadow-sm"
              >
                {isSavingDowntime ? "Saving..." : "Save Downtime"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
