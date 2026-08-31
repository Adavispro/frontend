/**
 * Dynamic Parameter Status Evaluation Utility for IIOT Parameters & Operational Detail Values.
 * 
 * Rules:
 * 1. IF value >= minimumLimit AND value <= maximumLimit -> NORMAL (GREEN)
 * 2. IF value < minimumLimit OR value > maximumLimit -> OUT_OF_RANGE (RED)
 * 3. Boundary values (value === minimumLimit or value === maximumLimit) are valid (NORMAL / GREEN)
 * 4. Missing/unconfigured limits -> UNCONFIGURED (Standard neutral styling)
 * 5. Null/undefined/NaN/empty values -> INVALID (Neutral dash/muted styling, never marked green)
 */

export type ParameterVisualStatus = "NORMAL" | "OUT_OF_RANGE" | "UNCONFIGURED" | "INVALID";

export interface ParameterStatusEvaluation {
  status: ParameterVisualStatus;
  statusClass: string;
  isNormal: boolean;
  isOutOfRange: boolean;
  formattedValue: string;
  numericValue: number | null;
}

export const PARAMETER_STATUS_CLASSES = {
  NORMAL: "text-emerald-700 font-bold font-mono bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200",
  OUT_OF_RANGE: "text-rose-700 font-black font-mono bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200",
  UNCONFIGURED: "text-slate-900 font-bold font-mono",
  INVALID: "text-slate-400 font-mono",
} as const;

export function evaluateParameterStatus(
  value: unknown,
  minimumLimit?: number | null,
  maximumLimit?: number | null,
  decimals: number = 2
): ParameterStatusEvaluation {
  // Handle empty / null / undefined values safely
  if (value === undefined || value === null || value === "") {
    return {
      status: "INVALID",
      statusClass: PARAMETER_STATUS_CLASSES.INVALID,
      isNormal: false,
      isOutOfRange: false,
      formattedValue: "-",
      numericValue: null,
    };
  }

  const numVal = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(numVal)) {
    return {
      status: "INVALID",
      statusClass: PARAMETER_STATUS_CLASSES.INVALID,
      isNormal: false,
      isOutOfRange: false,
      formattedValue: String(value),
      numericValue: null,
    };
  }

  const formattedValue = numVal.toFixed(decimals);

  const hasMin = minimumLimit !== undefined && minimumLimit !== null && !isNaN(minimumLimit);
  const hasMax = maximumLimit !== undefined && maximumLimit !== null && !isNaN(maximumLimit);

  // If no limits are configured for this parameter
  if (!hasMin && !hasMax) {
    return {
      status: "UNCONFIGURED",
      statusClass: PARAMETER_STATUS_CLASSES.UNCONFIGURED,
      isNormal: false,
      isOutOfRange: false,
      formattedValue,
      numericValue: numVal,
    };
  }

  // Check out of range condition (strictly less than min or strictly greater than max)
  const isBelowMin = hasMin && numVal < (minimumLimit as number);
  const isAboveMax = hasMax && numVal > (maximumLimit as number);

  if (isBelowMin || isAboveMax) {
    return {
      status: "OUT_OF_RANGE",
      statusClass: PARAMETER_STATUS_CLASSES.OUT_OF_RANGE,
      isNormal: false,
      isOutOfRange: true,
      formattedValue,
      numericValue: numVal,
    };
  }

  // Value is within configured allowed range (inclusive of boundary values)
  return {
    status: "NORMAL",
    statusClass: PARAMETER_STATUS_CLASSES.NORMAL,
    isNormal: true,
    isOutOfRange: false,
    formattedValue,
    numericValue: numVal,
  };
}
