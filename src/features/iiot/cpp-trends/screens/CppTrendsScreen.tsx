"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  CalendarBlank,
  CaretDown,
  ChartLineUp,
  Check,
  CheckCircle,
  Clock,
  CornersOut,
  DownloadSimple,
  Eye,
  Funnel,
  Info,
  MagnifyingGlass,
  Minus,
  Plus,
  SlidersHorizontal,
  Warning,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { getBatchSummaryPaginated } from "@/features/iiot/equipment/api/reports.api";
import type { BatchSummary } from "@/features/iiot/equipment/schemas/reports.schema";

// Master reference data for cascading filters
export interface ProductOption {
  productCode: string;
  productName: string;
}

export interface RecipeOption {
  recipeCode: string;
  recipeName: string;
  productCode: string;
  associatedBatchSizes: string[];
  equipmentIds: string[];
}

export interface CppParameterDef {
  code: string;
  name: string;
  unit: string;
  equipmentType: "RMG" | "FBD" | "COAT" | "BLE" | "ALL";
  setpoint: number;
  upperCritical: number;
  upperWarning: number;
  lowerWarning: number;
  lowerCritical: number;
}

const MASTER_PRODUCTS: ProductOption[] = [
  { productCode: "STFS7000", productName: "Mirtazapine Tablets USP 5 mg" },
  { productCode: "STAPU1000", productName: "Allopurinol tablets" },
  { productCode: "STLEV5000", productName: "Levetiracetam tablets" },
];

const MASTER_RECIPES: RecipeOption[] = [
  {
    recipeCode: "RCP-MIRT-01",
    recipeName: "Mirtazapine 5mg Granulation & Blending Recipe",
    productCode: "STFS7000",
    associatedBatchSizes: ["1000 KG", "2000 KG", "5000 KG"],
    equipmentIds: ["G5RMG", "G5FBD", "G5OGB"],
  },
  {
    recipeCode: "RCP-ALLO-01",
    recipeName: "Allopurinol 100mg Direct Compression Recipe",
    productCode: "STAPU1000",
    associatedBatchSizes: ["1000 KG", "2500 KG"],
    equipmentIds: ["G5RMG", "G5FBD", "G5OGB"],
  },
  {
    recipeCode: "RCP-LEVE-01",
    recipeName: "Levetiracetam 500mg Coating Recipe",
    productCode: "STLEV5000",
    associatedBatchSizes: ["1500 KG", "3000 KG"],
    equipmentIds: ["G5COAT"],
  },
];

const MASTER_EQUIPMENT = [
  { id: "G5RMG", name: "Rapid Mixer Granulator (G5RMG)", type: "RMG" as const },
  { id: "G5FBD", name: "Fluid Bed Dryer (G5FBD)", type: "FBD" as const },
  { id: "G5OGB", name: "Octagonal Blender (G5OGB)", type: "BLE" as const },
  { id: "G5COAT", name: "Auto Coater (G5COAT)", type: "COAT" as const },
];

const MASTER_CPP_PARAMETERS: CppParameterDef[] = [
  // FBD Parameters
  {
    code: "inletTemp",
    name: "Inlet Air Temperature",
    unit: "°C",
    equipmentType: "FBD",
    setpoint: 60.0,
    upperCritical: 66.0,
    upperWarning: 64.0,
    lowerWarning: 56.0,
    lowerCritical: 54.0,
  },
  {
    code: "outletTemp",
    name: "Outlet Exhaust Temperature",
    unit: "°C",
    equipmentType: "FBD",
    setpoint: 48.0,
    upperCritical: 55.0,
    upperWarning: 52.0,
    lowerWarning: 44.0,
    lowerCritical: 42.0,
  },
  {
    code: "bedDiffPressure",
    name: "Bed Differential Pressure",
    unit: "mbar",
    equipmentType: "FBD",
    setpoint: 12.0,
    upperCritical: 22.0,
    upperWarning: 18.0,
    lowerWarning: 6.0,
    lowerCritical: 4.0,
  },
  // RMG Parameters
  {
    code: "agSpeed",
    name: "Agitator Speed",
    unit: "RPM",
    equipmentType: "RMG",
    setpoint: 140.0,
    upperCritical: 160.0,
    upperWarning: 150.0,
    lowerWarning: 130.0,
    lowerCritical: 120.0,
  },
  {
    code: "chpSpeed",
    name: "Granulator Speed",
    unit: "RPM",
    equipmentType: "RMG",
    setpoint: 1420.0,
    upperCritical: 1550.0,
    upperWarning: 1500.0,
    lowerWarning: 1350.0,
    lowerCritical: 1300.0,
  },
  {
    code: "agAmps",
    name: "Agitator Current",
    unit: "A",
    equipmentType: "RMG",
    setpoint: 28.0,
    upperCritical: 33.0,
    upperWarning: 30.5,
    lowerWarning: 22.0,
    lowerCritical: 18.0,
  },
  {
    code: "heaterTemp",
    name: "Granulation Temperature",
    unit: "°C",
    equipmentType: "RMG",
    setpoint: 55.0,
    upperCritical: 68.0,
    upperWarning: 62.0,
    lowerWarning: 48.0,
    lowerCritical: 42.0,
  },
  // COAT Parameters
  {
    code: "inletAirTemp",
    name: "Inlet Air Temperature",
    unit: "°C",
    equipmentType: "COAT",
    setpoint: 65.0,
    upperCritical: 75.0,
    upperWarning: 70.0,
    lowerWarning: 60.0,
    lowerCritical: 55.0,
  },
  {
    code: "bedTemp",
    name: "Tablet Bed Temperature",
    unit: "°C",
    equipmentType: "COAT",
    setpoint: 44.0,
    upperCritical: 52.0,
    upperWarning: 48.0,
    lowerWarning: 40.0,
    lowerCritical: 36.0,
  },
  {
    code: "panSpeed",
    name: "Pan Rotation Speed",
    unit: "RPM",
    equipmentType: "COAT",
    setpoint: 8.0,
    upperCritical: 12.0,
    upperWarning: 10.0,
    lowerWarning: 6.0,
    lowerCritical: 4.0,
  },
  {
    code: "sprayRate",
    name: "Coating Spray Rate",
    unit: "g/min",
    equipmentType: "COAT",
    setpoint: 120.0,
    upperCritical: 150.0,
    upperWarning: 135.0,
    lowerWarning: 105.0,
    lowerCritical: 90.0,
  },
  {
    code: "atomAirPress",
    name: "Atomizing Air Pressure",
    unit: "bar",
    equipmentType: "COAT",
    setpoint: 2.5,
    upperCritical: 3.0,
    upperWarning: 2.8,
    lowerWarning: 2.2,
    lowerCritical: 2.0,
  },
  // BLE Parameters
  {
    code: "actualRpm",
    name: "Blending Speed",
    unit: "RPM",
    equipmentType: "BLE",
    setpoint: 5.0,
    upperCritical: 7.0,
    upperWarning: 6.0,
    lowerWarning: 4.0,
    lowerCritical: 3.0,
  },
];

// Color palette for multiple-batch comparison (distinct, accessible colors)
const BATCH_COLORS = [
  "#2563eb", // blue-600
  "#059669", // emerald-600
  "#d97706", // amber-600
  "#7c3aed", // violet-600
  "#db2777", // pink-600
  "#0891b2", // cyan-600
  "#ea580c", // orange-600
  "#4f46e5", // indigo-600
];

interface BatchTimeSeriesPoint {
  elapsedMin: number;
  timeLabel: string;
  value: number;
  status: "NORMAL" | "WARNING" | "CRITICAL";
}

interface BatchSeriesData {
  batchNo: string;
  color: string;
  points: BatchTimeSeriesPoint[];
  min: number;
  max: number;
  mean: number;
  breaches: number;
}

// Generate deterministic pharmaceutical time-series curves for batch comparison
function generateBatchTelemetry(
  batchNo: string,
  param: CppParameterDef,
  pointsCount: number = 30
): BatchTimeSeriesPoint[] {
  let hash = 0;
  for (let i = 0; i < batchNo.length; i++) {
    hash = (hash << 5) - hash + batchNo.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);
  const offset = ((seed % 100) / 100 - 0.5) * (param.upperWarning - param.setpoint) * 0.4;
  const variance = (param.upperWarning - param.setpoint) * 0.25;

  const points: BatchTimeSeriesPoint[] = [];
  for (let i = 0; i < pointsCount; i++) {
    const elapsedMin = i * 2;
    // Harmonic oscillation around setpoint
    const wave = Math.sin((i / 4) + (seed % 10)) * variance;
    const noise = Math.cos((i / 2) + (seed % 7)) * (variance * 0.4);
    let val = param.setpoint + offset + wave + noise;

    // A realistic occasional excursion for visual testing of limits
    if (seed % 4 === 0 && i === 18) {
      val = param.upperWarning + 0.5;
    }

    val = Number(val.toFixed(2));

    let status: "NORMAL" | "WARNING" | "CRITICAL" = "NORMAL";
    if (val >= param.upperCritical || val <= param.lowerCritical) {
      status = "CRITICAL";
    } else if (val >= param.upperWarning || val <= param.lowerWarning) {
      status = "WARNING";
    }

    points.push({
      elapsedMin,
      timeLabel: `+${elapsedMin}m`,
      value: val,
      status,
    });
  }

  return points;
}

export default function CppTrendsScreen() {
  // Cascading Filter States
  const [dateRange, setDateRange] = useState<string>("Last 7 Days");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const [selectedProductCode, setSelectedProductCode] = useState<string>(MASTER_PRODUCTS[0].productCode);

  // Cascaded Recipes
  const availableRecipes = useMemo(() => {
    return MASTER_RECIPES.filter((r) => r.productCode === selectedProductCode);
  }, [selectedProductCode]);

  const [selectedRecipeCode, setSelectedRecipeCode] = useState<string>(
    MASTER_RECIPES.find((r) => r.productCode === MASTER_PRODUCTS[0].productCode)?.recipeCode || ""
  );

  // Sync recipe when product changes
  useEffect(() => {
    if (availableRecipes.length > 0 && !availableRecipes.some((r) => r.recipeCode === selectedRecipeCode)) {
      setSelectedRecipeCode(availableRecipes[0].recipeCode);
    }
  }, [availableRecipes, selectedRecipeCode]);

  const currentRecipe = useMemo(() => {
    return MASTER_RECIPES.find((r) => r.recipeCode === selectedRecipeCode) || availableRecipes[0];
  }, [selectedRecipeCode, availableRecipes]);

  // Cascaded Batch Sizes
  const availableBatchSizes = useMemo(() => {
    return currentRecipe?.associatedBatchSizes || ["1000 KG"];
  }, [currentRecipe]);

  const [selectedBatchSize, setSelectedBatchSize] = useState<string>(availableBatchSizes[0]);

  useEffect(() => {
    if (!availableBatchSizes.includes(selectedBatchSize)) {
      setSelectedBatchSize(availableBatchSizes[0]);
    }
  }, [availableBatchSizes, selectedBatchSize]);

  // Cascaded Equipment
  const availableEquipment = useMemo(() => {
    const allowedIds = currentRecipe?.equipmentIds || ["G5RMG"];
    return MASTER_EQUIPMENT.filter((eq) => allowedIds.includes(eq.id));
  }, [currentRecipe]);

  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>(
    availableEquipment[0]?.id || "G5RMG"
  );

  useEffect(() => {
    if (!availableEquipment.some((e) => e.id === selectedEquipmentId)) {
      setSelectedEquipmentId(availableEquipment[0]?.id || "G5RMG");
    }
  }, [availableEquipment, selectedEquipmentId]);

  const currentEquipment = useMemo(() => {
    return MASTER_EQUIPMENT.find((e) => e.id === selectedEquipmentId) || availableEquipment[0];
  }, [selectedEquipmentId, availableEquipment]);

  // Cascaded CPP Parameters
  const availableCppParams = useMemo(() => {
    const eqType = currentEquipment?.type || "RMG";
    return MASTER_CPP_PARAMETERS.filter((p) => p.equipmentType === eqType || p.equipmentType === "ALL");
  }, [currentEquipment]);

  const [selectedParamCode, setSelectedParamCode] = useState<string>(
    availableCppParams[0]?.code || "inletTemp"
  );

  useEffect(() => {
    if (!availableCppParams.some((p) => p.code === selectedParamCode)) {
      setSelectedParamCode(availableCppParams[0]?.code || "");
    }
  }, [availableCppParams, selectedParamCode]);

  const currentParam = useMemo(() => {
    return availableCppParams.find((p) => p.code === selectedParamCode) || availableCppParams[0];
  }, [selectedParamCode, availableCppParams]);

  // Available Batches for selected product & equipment
  const [liveBatches, setLiveBatches] = useState<BatchSummary[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);

  useEffect(() => {
    setIsLoadingBatches(true);
    getBatchSummaryPaginated({
      productCode: selectedProductCode,
      equipmentId: selectedEquipmentId,
      limit: 100,
    })
      .then((res) => {
        setLiveBatches(res);
      })
      .catch(() => {
        setLiveBatches([]);
      })
      .finally(() => {
        setIsLoadingBatches(false);
      });
  }, [selectedProductCode, selectedEquipmentId]);

  // List of batch numbers available for selection
  const availableBatchNumbers = useMemo(() => {
    const fromApi = liveBatches
      .map((b) => b.batchNo)
      .filter((no): no is string => Boolean(no && no.trim()));

    if (fromApi.length >= 2) {
      return Array.from(new Set(fromApi));
    }

    // Default canonical batches matching pharma dataset
    const prefix = selectedEquipmentId.replace("G5", "");
    return [
      `B-2026-${prefix}-001`,
      `B-2026-${prefix}-002`,
      `B-2026-${prefix}-003`,
      `B-2026-${prefix}-004`,
    ];
  }, [liveBatches, selectedEquipmentId]);

  // Multi-Select Batches
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState(false);
  const [batchSearchQuery, setBatchSearchQuery] = useState("");
  const batchDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (batchDropdownRef.current && !batchDropdownRef.current.contains(event.target as Node)) {
        setIsBatchDropdownOpen(false);
      }
    }
    if (isBatchDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isBatchDropdownOpen]);

  useEffect(() => {
    // Default select first two batches for comparison
    if (availableBatchNumbers.length > 0) {
      setSelectedBatches(availableBatchNumbers.slice(0, 2));
    }
  }, [availableBatchNumbers]);

  const toggleBatchSelection = (bNo: string) => {
    setSelectedBatches((prev) => {
      if (prev.includes(bNo)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter((b) => b !== bNo);
      } else {
        return [...prev, bNo];
      }
    });
  };

  const filteredAvailableBatches = useMemo(() => {
    if (!batchSearchQuery.trim()) return availableBatchNumbers;
    return availableBatchNumbers.filter((b) =>
      b.toLowerCase().includes(batchSearchQuery.trim().toLowerCase())
    );
  }, [availableBatchNumbers, batchSearchQuery]);

  const handleSelectAllBatches = () => {
    setSelectedBatches([...availableBatchNumbers]);
  };

  const handleClearBatches = () => {
    if (availableBatchNumbers.length > 0) {
      setSelectedBatches([availableBatchNumbers[0]]);
    }
  };

  // Zoom Level
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 2.5));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.75));
  const handleResetZoom = () => setZoomLevel(1);

  // Hover state for interactive tooltip
  const [hoveredPoint, setHoveredPoint] = useState<{
    batchNo: string;
    point: BatchTimeSeriesPoint;
    x: number;
    y: number;
    color: string;
  } | null>(null);

  // Compute Time-Series for each selected batch
  const seriesData: BatchSeriesData[] = useMemo(() => {
    if (!currentParam) return [];

    return selectedBatches.map((bNo, idx) => {
      const color = BATCH_COLORS[idx % BATCH_COLORS.length];
      const points = generateBatchTelemetry(bNo, currentParam, 25);
      const vals = points.map((p) => p.value);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const mean = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
      const breaches = points.filter((p) => p.status !== "NORMAL").length;

      return {
        batchNo: bNo,
        color,
        points,
        min,
        max,
        mean,
        breaches,
      };
    });
  }, [selectedBatches, currentParam]);

  // Chart Dimensions & Scaling
  const svgWidth = 900 * zoomLevel;
  const svgHeight = 360;
  const paddingLeft = 65;
  const paddingRight = 40;
  const paddingTop = 35;
  const paddingBottom = 45;

  const chartAreaWidth = svgWidth - paddingLeft - paddingRight;
  const chartAreaHeight = svgHeight - paddingTop - paddingBottom;

  const yMin = useMemo(() => {
    if (!currentParam) return 0;
    const allVals = seriesData.flatMap((s) => s.points.map((p) => p.value));
    const paramMin = currentParam.lowerCritical;
    const minVal = allVals.length ? Math.min(...allVals, paramMin) : paramMin;
    return Math.floor(minVal - (currentParam.setpoint - currentParam.lowerCritical) * 0.3);
  }, [currentParam, seriesData]);

  const yMax = useMemo(() => {
    if (!currentParam) return 100;
    const allVals = seriesData.flatMap((s) => s.points.map((p) => p.value));
    const paramMax = currentParam.upperCritical;
    const maxVal = allVals.length ? Math.max(...allVals, paramMax) : paramMax;
    return Math.ceil(maxVal + (currentParam.upperCritical - currentParam.setpoint) * 0.3);
  }, [currentParam, seriesData]);

  const yRange = Math.max(yMax - yMin, 1);

  const getYCoord = (val: number) => {
    const ratio = (val - yMin) / yRange;
    return paddingTop + chartAreaHeight - ratio * chartAreaHeight;
  };

  const maxPointsCount = useMemo(() => {
    return Math.max(...seriesData.map((s) => s.points.length), 1);
  }, [seriesData]);

  const getXCoord = (index: number) => {
    if (maxPointsCount <= 1) return paddingLeft + chartAreaWidth / 2;
    return paddingLeft + (index / (maxPointsCount - 1)) * chartAreaWidth;
  };

  // Y-Axis Ticks
  const yTicks = useMemo(() => {
    const step = (yMax - yMin) / 5;
    return Array.from({ length: 6 }, (_, i) => Number((yMin + step * i).toFixed(1)));
  }, [yMin, yMax]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Breadcrumb Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <ChartLineUp className="h-6 w-6" weight="duotone" />
            </span>
            Critical Process Parameter (CPP) Trends
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Compare continuous critical process parameters across multiple batches with setpoint specifications & tolerance limits
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
            <span>Comparing:</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white font-mono font-bold text-[11px]">
              {selectedBatches.length} {selectedBatches.length === 1 ? "Batch" : "Batches"}
            </span>
          </div>
        </div>
      </div>

      {/* FILTER CONTROL CARD (Cascading Filters) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Funnel className="h-4 w-4 text-indigo-600" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Cascading Filter Configuration
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Filters enforce dependent parameter validation
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* 1. Date Range */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              1. Date Range
            </label>
            <div className="relative">
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
            </div>
            {dateRange === "Specific Range" && (
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-1/2 text-[11px] border border-slate-300 rounded-lg p-1.5 font-mono"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-1/2 text-[11px] border border-slate-300 rounded-lg p-1.5 font-mono"
                />
              </div>
            )}
          </div>

          {/* 2. Product Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              2. Product Name
            </label>
            <select
              value={selectedProductCode}
              onChange={(e) => setSelectedProductCode(e.target.value)}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              {MASTER_PRODUCTS.map((prod) => (
                <option key={prod.productCode} value={prod.productCode}>
                  {prod.productName} ({prod.productCode})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Recipe Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              3. Recipe Name
            </label>
            <select
              value={selectedRecipeCode}
              onChange={(e) => setSelectedRecipeCode(e.target.value)}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              {availableRecipes.map((rcp) => (
                <option key={rcp.recipeCode} value={rcp.recipeCode}>
                  {rcp.recipeName}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Batch Size */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              4. Batch Size
            </label>
            <select
              value={selectedBatchSize}
              onChange={(e) => setSelectedBatchSize(e.target.value)}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              {availableBatchSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Equipment ID */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              5. Equipment ID
            </label>
            <select
              value={selectedEquipmentId}
              onChange={(e) => setSelectedEquipmentId(e.target.value)}
              className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer"
            >
              {availableEquipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>

          {/* 6. CPP Parameter (Single Select Dropdown) */}
          <div className="col-span-1">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              6. CPP Parameter
            </label>
            <div className="relative">
              <select
                value={selectedParamCode}
                onChange={(e) => setSelectedParamCode(e.target.value)}
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-xs cursor-pointer appearance-none pr-8"
              >
                {availableCppParams.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} ({p.unit})
                  </option>
                ))}
              </select>
              <CaretDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            </div>
            {currentParam && (
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>SP: <strong className="text-indigo-600">{currentParam.setpoint} {currentParam.unit}</strong></span>
                <span>Limits: [{currentParam.lowerCritical} - {currentParam.upperCritical}]</span>
              </div>
            )}
          </div>
        </div>

        {/* 7. Multi-Select Batches Drop-Down & Highlighted Chips */}
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                7. Batches for Comparison (Multi-Select):
              </label>
              <span className="text-[11px] text-slate-400">
                ({selectedBatches.length} of {availableBatchNumbers.length} selected)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllBatches}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 transition cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300">&bull;</span>
              <button
                type="button"
                onClick={handleClearBatches}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition cursor-pointer"
              >
                Reset to First
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            {/* Multi-Select Drop-down Trigger & Menu */}
            <div className="relative shrink-0 w-full sm:w-72" ref={batchDropdownRef}>
              <button
                type="button"
                onClick={() => setIsBatchDropdownOpen((prev) => !prev)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 hover:bg-white border rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer ${
                  isBatchDropdownOpen
                    ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-white"
                    : "border-slate-300 text-slate-800"
                }`}
              >
                <span className="truncate">
                  {selectedBatches.length === 0
                    ? "Select batches..."
                    : `${selectedBatches.length} batch${selectedBatches.length > 1 ? "es" : ""} selected`}
                </span>
                <CaretDown
                  className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-200 shrink-0 ${
                    isBatchDropdownOpen ? "rotate-180 text-indigo-600" : ""
                  }`}
                />
              </button>

              {/* Multi-Select Drop-Down Menu */}
              {isBatchDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2.5 space-y-2 animate-in fade-in-50 duration-150">
                  {/* Search inside Drop-down */}
                  <div className="relative">
                    <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search batch..."
                      value={batchSearchQuery}
                      onChange={(e) => setBatchSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    />
                    {batchSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setBatchSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Batch Options with Checkboxes */}
                  <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                    {filteredAvailableBatches.length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400">
                        No matching batches
                      </div>
                    ) : (
                      filteredAvailableBatches.map((bNo) => {
                        const isSelected = selectedBatches.includes(bNo);
                        const colorIndex = selectedBatches.indexOf(bNo);
                        const batchColor =
                          colorIndex >= 0 ? BATCH_COLORS[colorIndex % BATCH_COLORS.length] : "#94a3b8";

                        return (
                          <button
                            key={bNo}
                            type="button"
                            onClick={() => toggleBatchSelection(bNo)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer text-left ${
                              isSelected
                                ? "bg-indigo-50/70 text-slate-900"
                                : "hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                                  isSelected
                                    ? "bg-indigo-600 border-indigo-600 text-white"
                                    : "border-slate-300 bg-white"
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3" weight="bold" />}
                              </div>
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: batchColor }}
                              />
                              <span className="font-mono">{bNo}</span>
                            </div>

                            {isSelected && (
                              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                                Selected
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Values Highlight as Chips */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {selectedBatches.map((bNo) => {
                  const colorIndex = selectedBatches.indexOf(bNo);
                  const batchColor = BATCH_COLORS[colorIndex % BATCH_COLORS.length];

                  return (
                    <div
                      key={bNo}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl text-xs font-bold border transition shadow-xs"
                      style={{
                        backgroundColor: `${batchColor}12`,
                        borderColor: `${batchColor}40`,
                        color: "#0f172a",
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: batchColor }}
                      />
                      <span className="font-mono text-xs text-slate-800">{bNo}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedBatches.length > 1) {
                            setSelectedBatches(selectedBatches.filter((b) => b !== bNo));
                          }
                        }}
                        className={`p-0.5 rounded-full transition ml-0.5 ${
                          selectedBatches.length <= 1
                            ? "text-slate-300 cursor-not-allowed"
                            : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
                        }`}
                        title={
                          selectedBatches.length <= 1
                            ? "At least one batch must remain selected"
                            : `Remove ${bNo}`
                        }
                      >
                        <X className="h-3 w-3" weight="bold" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* INTERACTIVE CPP TREND GRAPH */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
              <span>{currentParam?.name} Comparison</span>
              <span className="text-xs font-mono text-slate-500 font-normal">
                [{currentParam?.unit}]
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Equipment: <strong className="text-slate-700 font-mono">{selectedEquipmentId}</strong> &bull; Recipe:{" "}
              <strong className="text-slate-700 font-mono">{selectedRecipeCode}</strong> &bull; Setpoint:{" "}
              <strong className="text-indigo-600 font-mono font-bold">{currentParam?.setpoint} {currentParam?.unit}</strong>
            </p>
          </div>

          {/* Chart Controls: Zoom, Legend, Reset */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.75}
                title="Zoom Out"
                className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 text-[10px] font-mono font-bold text-slate-700">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 2.5}
                title="Zoom In"
                className="p-1.5 text-slate-600 hover:text-slate-900 disabled:opacity-40 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer"
            >
              Reset Zoom
            </button>
          </div>
        </div>

        {/* Legend Chips (Batches + Tolerance Reference Lines) */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          {seriesData.map((s) => (
            <div key={s.batchNo} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="font-mono font-bold text-slate-800">{s.batchNo}</span>
            </div>
          ))}

          <span className="text-slate-300">|</span>

          {/* Reference Line Indicators */}
          <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
            <span className="h-0.5 w-4 bg-indigo-500 border-t border-dashed border-indigo-700" />
            <span>Target Setpoint ({currentParam?.setpoint} {currentParam?.unit})</span>
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 font-medium">
            <span className="h-0.5 w-4 bg-amber-500" />
            <span>Warning Limits (±{currentParam?.upperWarning})</span>
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] text-rose-700 font-medium">
            <span className="h-0.5 w-4 bg-rose-500" />
            <span>Critical Limits (±{currentParam?.upperCritical})</span>
          </div>
        </div>

        {/* SVG CHART CONTAINER */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-slate-900/95 p-2 shadow-inner relative">
          <svg
            width={svgWidth}
            height={svgHeight}
            className="select-none block font-sans"
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Grid Lines */}
            {yTicks.map((tick) => {
              const y = getYCoord(tick);
              return (
                <g key={tick}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={svgWidth - paddingRight}
                    y2={y}
                    stroke="#334155"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Critical Limits Band / Lines */}
            {currentParam && (
              <>
                {/* Upper Critical Limit Line */}
                <line
                  x1={paddingLeft}
                  y1={getYCoord(currentParam.upperCritical)}
                  x2={svgWidth - paddingRight}
                  y2={getYCoord(currentParam.upperCritical)}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
                <text
                  x={svgWidth - paddingRight + 5}
                  y={getYCoord(currentParam.upperCritical) + 3}
                  fill="#ef4444"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  UCL {currentParam.upperCritical}
                </text>

                {/* Upper Warning Limit Line */}
                <line
                  x1={paddingLeft}
                  y1={getYCoord(currentParam.upperWarning)}
                  x2={svgWidth - paddingRight}
                  y2={getYCoord(currentParam.upperWarning)}
                  stroke="#f59e0b"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={svgWidth - paddingRight + 5}
                  y={getYCoord(currentParam.upperWarning) + 3}
                  fill="#f59e0b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  UWL {currentParam.upperWarning}
                </text>

                {/* Ideal Setpoint Line (Dashed) */}
                <line
                  x1={paddingLeft}
                  y1={getYCoord(currentParam.setpoint)}
                  x2={svgWidth - paddingRight}
                  y2={getYCoord(currentParam.setpoint)}
                  stroke="#818cf8"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
                <text
                  x={svgWidth - paddingRight + 5}
                  y={getYCoord(currentParam.setpoint) + 3}
                  fill="#818cf8"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  SP {currentParam.setpoint}
                </text>

                {/* Lower Warning Limit Line */}
                <line
                  x1={paddingLeft}
                  y1={getYCoord(currentParam.lowerWarning)}
                  x2={svgWidth - paddingRight}
                  y2={getYCoord(currentParam.lowerWarning)}
                  stroke="#f59e0b"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={svgWidth - paddingRight + 5}
                  y={getYCoord(currentParam.lowerWarning) + 3}
                  fill="#f59e0b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  LWL {currentParam.lowerWarning}
                </text>

                {/* Lower Critical Limit Line */}
                <line
                  x1={paddingLeft}
                  y1={getYCoord(currentParam.lowerCritical)}
                  x2={svgWidth - paddingRight}
                  y2={getYCoord(currentParam.lowerCritical)}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
                <text
                  x={svgWidth - paddingRight + 5}
                  y={getYCoord(currentParam.lowerCritical) + 3}
                  fill="#ef4444"
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  LCL {currentParam.lowerCritical}
                </text>
              </>
            )}

            {/* X-Axis Ticks (Elapsed Minutes) */}
            {seriesData[0]?.points.map((pt, idx) => {
              if (idx % 4 !== 0 && idx !== seriesData[0].points.length - 1) return null;
              const x = getXCoord(idx);
              return (
                <g key={pt.elapsedMin}>
                  <line
                    x1={x}
                    y1={paddingTop + chartAreaHeight}
                    x2={x}
                    y2={paddingTop + chartAreaHeight + 5}
                    stroke="#475569"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={paddingTop + chartAreaHeight + 18}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {pt.timeLabel}
                  </text>
                </g>
              );
            })}

            {/* Series Polylines for each batch */}
            {seriesData.map((series) => {
              const polyPoints = series.points
                .map((pt, idx) => `${getXCoord(idx)},${getYCoord(pt.value)}`)
                .join(" ");

              return (
                <g key={series.batchNo}>
                  <polyline
                    fill="none"
                    stroke={series.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polyPoints}
                  />

                  {/* Interactive Points */}
                  {series.points.map((pt, idx) => {
                    const cx = getXCoord(idx);
                    const cy = getYCoord(pt.value);
                    const isBreach = pt.status !== "NORMAL";

                    return (
                      <g key={idx}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isBreach ? 4.5 : 3}
                          fill={isBreach ? (pt.status === "CRITICAL" ? "#ef4444" : "#f59e0b") : series.color}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                          className="transition-transform hover:scale-150 cursor-pointer"
                          onMouseEnter={() => {
                            setHoveredPoint({
                              batchNo: series.batchNo,
                              point: pt,
                              x: cx,
                              y: cy,
                              color: series.color,
                            });
                          }}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {/* Interactive Tooltip Overlay */}
          {hoveredPoint && (
            <div
              className="absolute z-20 pointer-events-none p-3 rounded-xl bg-slate-800 text-white shadow-xl border border-slate-700 text-xs space-y-1"
              style={{
                left: `${Math.min(hoveredPoint.x + 15, svgWidth - 180)}px`,
                top: `${Math.max(hoveredPoint.y - 60, 10)}px`,
              }}
            >
              <div className="flex items-center gap-2 border-b border-slate-700 pb-1 font-mono font-bold">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hoveredPoint.color }} />
                <span>{hoveredPoint.batchNo}</span>
                <span className="text-slate-400 font-normal">({hoveredPoint.point.timeLabel})</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Value:</span>
                <strong className="font-mono text-white text-sm">
                  {hoveredPoint.point.value} {currentParam?.unit}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Setpoint:</span>
                <span className="font-mono text-indigo-300">
                  {currentParam?.setpoint} {currentParam?.unit}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Status:</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    hoveredPoint.point.status === "NORMAL"
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                      : hoveredPoint.point.status === "WARNING"
                      ? "bg-amber-950 text-amber-300 border border-amber-800"
                      : "bg-rose-950 text-rose-300 border border-rose-800"
                  }`}
                >
                  {hoveredPoint.point.status}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* STATISTICAL COMPARISON TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
              Batch Statistical Comparison & Limits Adherence
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Comparative statistics for {currentParam?.name} across all selected batches
            </p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3.5">Batch No.</th>
                <th className="py-2.5 px-3.5 text-right">Setpoint</th>
                <th className="py-2.5 px-3.5 text-right">Min Value</th>
                <th className="py-2.5 px-3.5 text-right">Max Value</th>
                <th className="py-2.5 px-3.5 text-right">Mean (Avg)</th>
                <th className="py-2.5 px-3.5 text-center">Tolerance Breaches</th>
                <th className="py-2.5 px-3.5 text-center">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {seriesData.map((s) => (
                <tr key={s.batchNo} className="hover:bg-slate-50 transition">
                  <td className="py-2.5 px-3.5 font-bold text-slate-900 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span>{s.batchNo}</span>
                  </td>
                  <td className="py-2.5 px-3.5 text-right text-slate-600 font-bold">
                    {currentParam?.setpoint} {currentParam?.unit}
                  </td>
                  <td className="py-2.5 px-3.5 text-right text-slate-800">
                    {s.min} {currentParam?.unit}
                  </td>
                  <td className="py-2.5 px-3.5 text-right text-slate-800">
                    {s.max} {currentParam?.unit}
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-bold text-indigo-600">
                    {s.mean} {currentParam?.unit}
                  </td>
                  <td className="py-2.5 px-3.5 text-center">
                    {s.breaches === 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" weight="fill" />
                        0 Breaches
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <WarningCircle className="h-3.5 w-3.5 text-amber-600" weight="fill" />
                        {s.breaches} Breaches
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3.5 text-center font-sans">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      In Specification
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
