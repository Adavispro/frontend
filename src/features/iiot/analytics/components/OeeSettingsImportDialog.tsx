"use client";

import { useMemo, useState } from "react";
import { saveOeeSettings } from "../api/oee.api";
import { parseCsv } from "./OeeDowntimeImportDialog";
import { DEFAULT_SHIFTS, scopeKey, type OeeEquipment, type OeeSettings, type ShiftId } from "../utils/oee-engine";

const HEADERS = ["equipmentId", "tenantId", "plantId", "effectiveFrom", "effectiveTo", "timeZone",
  "shifts", "weekdays", "downtimeComplete", "productCode", "idealHours"] as const;
const REQUIRED = ["equipmentId", "tenantId", "plantId", "effectiveFrom", "effectiveTo"] as const;
const MAX_ROWS = 1000;
const SAMPLE_URL = "/samples/oee-config-sample.csv";
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const ALL_SHIFTS = DEFAULT_SHIFTS.map(s => s.id);

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const validZone = (value: string) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } };
const list = (value: string) => value.split(/[;|]/).map(v => v.trim()).filter(Boolean);

function parseShifts(value: string): ShiftId[] | null {
  if (!value || /^(24h|all)$/i.test(value)) return [...ALL_SHIFTS];
  const shifts = list(value).map(v => `Shift ${v.replace(/^shift\s*/i, "")}`);
  return shifts.every(s => (ALL_SHIFTS as string[]).includes(s)) ? Array.from(new Set(shifts)) as ShiftId[] : null;
}

function parseWeekdays(value: string): number[] | null {
  if (!value || /^all$/i.test(value)) return [0, 1, 2, 3, 4, 5, 6];
  const days = list(value).map(v => /^\d$/.test(v) ? Number(v) : DAY_NAMES.indexOf(v.slice(0, 3).toUpperCase()));
  return days.every(d => d >= 0 && d <= 6) ? Array.from(new Set(days)).sort() : null;
}

function parseBool(value: string): boolean | null {
  if (!value) return false;
  if (/^(true|yes|y|1)$/i.test(value)) return true;
  if (/^(false|no|n|0)$/i.test(value)) return false;
  return null;
}

type ParsedRow = { line: number; key: string; schedule: string; settings: OeeSettings; productCode: string; idealHours?: number; errors: string[] };

export default function OeeSettingsImportDialog({ equipment, settings, onSaved, onClose }: {
  equipment: OeeEquipment[];
  settings: OeeSettings[];
  onSaved: (value: OeeSettings) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const parsed = useMemo((): { rows: ParsedRow[]; headerError: string } => {
    if (!text.trim()) return { rows: [], headerError: "" };
    const [header, ...data] = parseCsv(text.replace(/^\uFEFF/, ""));
    const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
    const missing = REQUIRED.filter(h => !index.has(h.toLowerCase()));
    if (missing.length) return { rows: [], headerError: `Missing column(s): ${missing.join(", ")}.` };
    if (data.length > MAX_ROWS) return { rows: [], headerError: `At most ${MAX_ROWS} rows can be imported at once.` };
    const known = new Map(equipment.map(eq => [scopeKey(eq.tenantId, eq.plantId, eq.code).toUpperCase(), eq]));
    const scheduleByKey = new Map<string, string>();
    const productsByKey = new Map<string, Set<string>>();
    return {
      headerError: "",
      rows: data.map((cells, i) => {
        const get = (h: typeof HEADERS[number]) => (cells[index.get(h.toLowerCase()) ?? -1] ?? "").trim();
        const errors: string[] = [];
        REQUIRED.forEach(h => { if (!get(h)) errors.push(`${h} is required`); });
        const eq = known.get(scopeKey(get("tenantId"), get("plantId"), get("equipmentId")).toUpperCase());
        if (get("equipmentId") && get("tenantId") && get("plantId") && !eq) errors.push("equipment not found in the selected tenant/plant");
        const fromDate = get("effectiveFrom"), toDate = get("effectiveTo"), timeZone = get("timeZone") || defaultTimeZone;
        if (fromDate && !validDate(fromDate)) errors.push("effectiveFrom must be YYYY-MM-DD");
        if (toDate && !validDate(toDate)) errors.push("effectiveTo must be YYYY-MM-DD");
        if (validDate(fromDate) && validDate(toDate) && fromDate > toDate) errors.push("effectiveFrom must not be after effectiveTo");
        if (!validZone(timeZone)) errors.push("timeZone must be an IANA zone such as Asia/Kolkata");
        const shifts = parseShifts(get("shifts"));
        if (!shifts) errors.push("shifts must be 24h or 1;2;3");
        const weekdays = parseWeekdays(get("weekdays"));
        if (!weekdays) errors.push("weekdays must be all, Mon;Tue;… or 0–6 (0 = Sun)");
        const downtimeComplete = parseBool(get("downtimeComplete"));
        if (downtimeComplete === null) errors.push("downtimeComplete must be true or false");
        const productCode = get("productCode").toUpperCase(), hoursText = get("idealHours");
        const idealHours = hoursText ? Number(hoursText) : undefined;
        if (hoursText && !(idealHours! > 0 && Number.isFinite(idealHours))) errors.push("idealHours must be a positive number");
        if (hoursText && !productCode) errors.push("productCode is required when idealHours is set");
        if (productCode && !hoursText) errors.push("idealHours is required when productCode is set");

        const key = eq ? eq.id : `${get("tenantId")}|${get("plantId")}|${get("equipmentId")}`.toUpperCase();
        const schedule = [fromDate, toDate, timeZone, shifts?.join(";"), weekdays?.join(";"), downtimeComplete].join(",");
        const first = scheduleByKey.get(key);
        if (first === undefined) scheduleByKey.set(key, schedule);
        else if (first !== schedule) errors.push("schedule columns differ from the first row of this equipment");
        if (productCode) {
          const seen = productsByKey.get(key) ?? new Set<string>();
          if (seen.has(productCode)) errors.push("duplicate productCode for this equipment");
          seen.add(productCode); productsByKey.set(key, seen);
        }
        return {
          line: i + 2, key, schedule, productCode, idealHours, errors,
          settings: {
            equipmentId: eq?.code ?? get("equipmentId").toUpperCase(), tenantId: eq?.tenantId ?? get("tenantId"),
            plantId: eq?.plantId ?? get("plantId"), fromDate, toDate, timeZone,
            scheduledShifts: shifts ?? [], scheduledWeekdays: weekdays ?? [], idealBatchHours: {},
            downtimeComplete: Boolean(downtimeComplete),
          },
        };
      }),
    };
  }, [text, equipment, defaultTimeZone]);

  const groups = useMemo(() => {
    const map = new Map<string, OeeSettings>();
    for (const row of parsed.rows) {
      const group = map.get(row.key) ?? { ...row.settings, idealBatchHours: {} };
      if (row.productCode && row.idealHours) group.idealBatchHours[row.productCode] = row.idealHours;
      map.set(row.key, group);
    }
    return Array.from(map.values());
  }, [parsed.rows]);

  const invalid = parsed.rows.filter(row => row.errors.length);
  const canImport = groups.length > 0 && !invalid.length && !parsed.headerError && !saving;

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError(""); setResult("");
    setFileName(file.name);
    setText(await file.text());
  }

  async function submit() {
    setError(""); setResult("");
    setSaving(true);
    const done: string[] = [], failed: string[] = [];
    for (const group of groups) {
      const existing = settings.find(s => scopeKey(s.tenantId, s.plantId, s.equipmentId) === scopeKey(group.tenantId, group.plantId, group.equipmentId));
      try {
        // Ideal hours already saved for products not in the CSV are kept; CSV values win.
        onSaved(await saveOeeSettings({ ...group, idealBatchHours: { ...existing?.idealBatchHours, ...group.idealBatchHours } }));
        done.push(group.equipmentId);
      } catch (err) {
        failed.push(`${group.equipmentId}: ${err instanceof Error ? err.message : "save failed"}`);
      }
    }
    setSaving(false);
    if (done.length) setResult(`Saved OEE configuration for ${done.length} equipment: ${done.join(", ")}.`);
    if (failed.length) setError(`Not saved – ${failed.join(" · ")}`);
    else { setText(""); setFileName(""); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="oee-settings-import-title"
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 space-y-4 text-xs">
        <div>
          <h2 id="oee-settings-import-title" className="text-base font-bold">Import OEE configuration from CSV</h2>
          <p className="text-slate-600">One row per equipment and product. Required: {REQUIRED.join(", ")} (dates YYYY-MM-DD).
            Optional: timeZone (defaults to {defaultTimeZone}), shifts (24h or 1;2;3 – default 24h), weekdays (all, Mon;Tue;… or 0–6 – default all),
            downtimeComplete (true/false – default false), productCode + idealHours (hours per lot at rated speed).</p>
          <p className="mt-1 text-slate-600">Repeat the same schedule columns on every row of an equipment; leave productCode empty for a schedule-only row.
            Each equipment&apos;s saved schedule is replaced; ideal hours for products not in the file are kept.</p>
          <a href={SAMPLE_URL} download className="mt-1 inline-block font-semibold text-indigo-700 underline">Download sample CSV</a>
        </div>
        {result && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{result}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 font-semibold text-indigo-700">
            Choose CSV file
            <input type="file" accept=".csv,text/csv" className="sr-only" disabled={saving}
              onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <span className="text-slate-500">{fileName || "or paste CSV text below"}</span>
        </div>
        <textarea aria-label="CSV text" rows={6} value={text} disabled={saving}
          onChange={e => { setText(e.target.value); setResult(""); }}
          placeholder={HEADERS.join(",")} className="w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px]" />
        {parsed.headerError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{parsed.headerError}</p>}
        {parsed.rows.length > 0 && <div className="space-y-2">
          <p className={invalid.length ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>
            {parsed.rows.length} row(s) read for {groups.length} equipment · {invalid.length
              ? `${invalid.length} with errors – fix them before importing` : "all rows valid"}
          </p>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-100"><tr>
                {["Row", "Equipment", "Effective", "Shifts / days", "Downtime complete", "Product", "Ideal h", "Status"].map(h => <th key={h} className="p-2">{h}</th>)}
              </tr></thead>
              <tbody>{parsed.rows.map(row => <tr key={row.line} className={row.errors.length ? "bg-red-50" : "border-t"}>
                <td className="p-2">{row.line}</td>
                <td className="p-2">{row.settings.equipmentId} <span className="text-slate-400">{row.settings.plantId}</span></td>
                <td className="p-2">{row.settings.fromDate} → {row.settings.toDate}<br /><span className="text-slate-400">{row.settings.timeZone}</span></td>
                <td className="p-2">{row.settings.scheduledShifts.length} shift(s) · {row.settings.scheduledWeekdays.map(d => DAY_NAMES[d].slice(0, 2)).join(" ")}</td>
                <td className="p-2">{row.settings.downtimeComplete ? "Yes" : "No"}</td>
                <td className="p-2">{row.productCode || <span className="text-slate-400">schedule only</span>}</td>
                <td className="p-2">{row.idealHours ?? ""}</td>
                <td className="p-2">{row.errors.length ? <span className="text-red-700">{row.errors.join("; ")}</span>
                  : <span className="text-emerald-700">OK</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2">Close</button>
          <button type="button" disabled={!canImport} onClick={submit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">
            {saving ? "Saving..." : `Save ${groups.length || ""} equipment`}
          </button>
        </div>
      </div>
    </div>
  );
}
