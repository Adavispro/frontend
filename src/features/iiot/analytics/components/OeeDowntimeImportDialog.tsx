"use client";

import { useMemo, useState } from "react";
import { importOeeDowntime, type OeeDowntimeInput } from "../api/oee.api";
import {
  PLANNED_DOWNTIME_CATEGORIES, UNPLANNED_DOWNTIME_CATEGORIES,
  type DowntimeRecord, type OeeEquipment,
} from "../utils/oee-engine";

const HEADERS = ["equipmentId", "tenantId", "plantId", "date", "startTime", "endTime",
  "classification", "category", "reason", "comments", "timeZone"] as const;
const REQUIRED = HEADERS.filter(h => h !== "comments" && h !== "timeZone");
const MAX_ROWS = 1000;
const SAMPLE_URL = "/samples/oee-downtime-sample.csv";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

type ParsedRow = { line: number; input: OeeDowntimeInput; errors: string[] };

export default function OeeDowntimeImportDialog({ equipment, onImported, onClose }: {
  equipment: OeeEquipment[];
  onImported: (records: DowntimeRecord[]) => void;
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
    const known = new Set(equipment.map(eq => `${eq.tenantId}|${eq.plantId}|${eq.code}`.toUpperCase()));
    return {
      headerError: "",
      rows: data.map((cells, i) => {
        const get = (h: typeof HEADERS[number]) => (cells[index.get(h.toLowerCase()) ?? -1] ?? "").trim();
        const classification = get("classification").toUpperCase();
        const input = {
          equipmentId: get("equipmentId").toUpperCase(), tenantId: get("tenantId"), plantId: get("plantId"),
          date: get("date"), startTime: get("startTime"), endTime: get("endTime"),
          classification: classification as OeeDowntimeInput["classification"],
          category: get("category"), reason: get("reason"), comments: get("comments"),
          timeZone: get("timeZone") || defaultTimeZone,
        };
        const errors: string[] = [];
        REQUIRED.forEach(h => { if (!get(h)) errors.push(`${h} is required`); });
        if (input.equipmentId && input.tenantId && input.plantId
          && !known.has(`${input.tenantId}|${input.plantId}|${input.equipmentId}`.toUpperCase())) {
          errors.push("equipment not found in the selected tenant/plant");
        }
        if (input.date && !validDate(input.date)) errors.push("date must be YYYY-MM-DD");
        if (input.startTime && !validTime(input.startTime)) errors.push("startTime must be HH:mm");
        if (input.endTime && !validTime(input.endTime)) errors.push("endTime must be HH:mm");
        if (input.startTime && input.startTime === input.endTime) errors.push("start and end must differ");
        const categories: readonly string[] = classification === "PLANNED" ? PLANNED_DOWNTIME_CATEGORIES
          : classification === "UNPLANNED" ? UNPLANNED_DOWNTIME_CATEGORIES : [];
        if (classification && !categories.length) errors.push("classification must be PLANNED or UNPLANNED");
        else if (input.category && !categories.includes(input.category)) errors.push(`category must be one of: ${categories.join(", ")}`);
        return { line: i + 2, input, errors };
      }),
    };
  }, [text, equipment, defaultTimeZone]);

  const invalid = parsed.rows.filter(row => row.errors.length);
  const canImport = parsed.rows.length > 0 && !invalid.length && !parsed.headerError && !saving;

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError(""); setResult("");
    setFileName(file.name);
    setText(await file.text());
  }

  async function submit() {
    setError(""); setResult("");
    setSaving(true);
    try {
      const response = await importOeeDowntime(parsed.rows.map(row => row.input));
      onImported(response.downtime);
      setResult(`Imported ${response.imported} downtime record(s).`);
      setText(""); setFileName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import downtime.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="oee-downtime-import-title"
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 space-y-4 text-xs">
        <div>
          <h2 id="oee-downtime-import-title" className="text-base font-bold">Import downtime from CSV</h2>
          <p className="text-slate-600">One row per stop. Required columns: {REQUIRED.join(", ")}. Optional: comments, timeZone
            (defaults to {defaultTimeZone}). Times are HH:mm in plant time; an end time earlier than the start crosses midnight.
            The import is all-or-nothing and accepts up to {MAX_ROWS} rows.</p>
          <p className="mt-1 text-slate-600">Planned categories: {PLANNED_DOWNTIME_CATEGORIES.join(", ")}.
            Unplanned categories: {UNPLANNED_DOWNTIME_CATEGORIES.join(", ")}.</p>
          <a href={SAMPLE_URL} download className="mt-1 inline-block font-semibold text-indigo-700 underline">Download sample CSV</a>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {result && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{result}</p>}
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
            {parsed.rows.length} row(s) read · {invalid.length ? `${invalid.length} with errors – fix them before importing` : "all rows valid"}
          </p>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-100"><tr>
                {["Row", "Equipment", "Date", "Time", "Class", "Category", "Reason", "Status"].map(h => <th key={h} className="p-2">{h}</th>)}
              </tr></thead>
              <tbody>{parsed.rows.map(row => <tr key={row.line} className={row.errors.length ? "bg-red-50" : "border-t"}>
                <td className="p-2">{row.line}</td>
                <td className="p-2">{row.input.equipmentId} <span className="text-slate-400">{row.input.plantId}</span></td>
                <td className="p-2">{row.input.date}</td>
                <td className="p-2">{row.input.startTime}–{row.input.endTime}</td>
                <td className="p-2">{row.input.classification}</td>
                <td className="p-2">{row.input.category}</td>
                <td className="p-2">{row.input.reason}</td>
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
            {saving ? "Importing..." : `Import ${parsed.rows.length || ""} row(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
