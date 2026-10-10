"use client";

import { useMemo, useState } from "react";
import { deleteOeeSettings, saveOeeSettings } from "../api/oee.api";
import { DEFAULT_SHIFTS, scopeKey, type OeeBatch, type OeeEquipment, type OeeSettings, type ShiftId } from "../utils/oee-engine";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Number(value.toFixed(2));
}

function actualHours(batch: OeeBatch) {
  if (batch.evidence?.runtimeHours) return batch.evidence.runtimeHours;
  const start = batch.startAt ? Date.parse(batch.startAt) : NaN, end = batch.endAt ? Date.parse(batch.endAt) : NaN;
  return end > start ? (end - start) / 3_600_000 : null;
}

export default function OeeSettingsDialog({ equipment: equipmentProp, settings, products, batches, fromDate, toDate, onSaved, onDeleted, onClose, onImportCsv }: {
  equipment: OeeEquipment[];
  settings: OeeSettings[];
  products: { code: string; name: string }[];
  batches: OeeBatch[];
  fromDate: string;
  toDate: string;
  onSaved: (value: OeeSettings) => void;
  onDeleted: (value: OeeSettings) => void;
  onClose: () => void;
  onImportCsv?: () => void;
}) {
  // Saved configs whose equipment is outside the current page filter must still be viewable/editable.
  const equipment = useMemo(() => {
    const known = new Set(equipmentProp.map(eq => eq.id));
    const extra = settings.filter(s => !known.has(scopeKey(s.tenantId, s.plantId, s.equipmentId))).map(s => ({
      id: scopeKey(s.tenantId, s.plantId, s.equipmentId), code: s.equipmentId, name: s.equipmentId,
      status: "", tenantId: s.tenantId, plantId: s.plantId,
    }));
    return [...equipmentProp, ...extra];
  }, [equipmentProp, settings]);
  const savedFor = (eq: OeeEquipment) => settings.find(s => scopeKey(s.tenantId, s.plantId, s.equipmentId) === eq.id);
  const blankDraft = (eq: OeeEquipment): OeeSettings => ({
    equipmentId: eq.code, tenantId: eq.tenantId, plantId: eq.plantId,
    fromDate, toDate, scheduledShifts: DEFAULT_SHIFTS.map(s => s.id), scheduledWeekdays: [0, 1, 2, 3, 4, 5, 6],
    idealBatchHours: {}, downtimeComplete: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const makeDraft = (eq: OeeEquipment): OeeSettings => savedFor(eq) ?? blankDraft(eq);
  const [equipmentKey, setEquipmentKey] = useState(equipment[0]?.id || "");
  const [draft, setDraft] = useState<OeeSettings | null>(equipment[0] ? makeDraft(equipment[0]) : null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputClass = "w-full rounded-lg border border-slate-300 p-2 text-xs";
  const current = equipment.find(eq => eq.id === equipmentKey);
  const saved = current ? savedFor(current) : undefined;

  // Suggested ideal hours per product: median report/capacity ideal, else median actual run time.
  const suggestions = useMemo(() => {
    const byProduct = new Map<string, { ideal: number[]; actual: number[] }>();
    for (const batch of batches) {
      if (batch.equipmentId !== equipmentKey || !batch.productCode) continue;
      const code = batch.productCode.toUpperCase();
      const entry = byProduct.get(code) ?? { ideal: [], actual: [] };
      if (batch.evidence?.idealHours) entry.ideal.push(batch.evidence.idealHours);
      const hours = actualHours(batch);
      if (hours) entry.actual.push(hours);
      byProduct.set(code, entry);
    }
    return new Map(Array.from(byProduct, ([code, v]) => {
      const ideal = median(v.ideal);
      return [code, ideal !== null
        ? { hours: ideal, basis: `median rated ideal of ${v.ideal.length} lot(s)` }
        : { hours: median(v.actual), basis: `median actual run of ${v.actual.length} lot(s)` }];
    }));
  }, [batches, equipmentKey]);
  const [addedCodes, setAddedCodes] = useState<string[]>([]);
  const [removedCodes, setRemovedCodes] = useState<string[]>([]);
  const [newProduct, setNewProduct] = useState("");
  const [deletingKey, setDeletingKey] = useState("");
  const codes = Array.from(new Set([...suggestions.keys(), ...Object.keys(draft?.idealBatchHours ?? {}), ...addedCodes]))
    .filter(code => code && !removedCodes.includes(code)).sort();
  const productName = (code: string) => products.find(p => p.code === code)?.name || code;
  const addableProducts = products.filter(p => !codes.includes(p.code));

  const selectEquipment = (eq: OeeEquipment) => {
    setEquipmentKey(eq.id); setDraft(makeDraft(eq)); setError("");
    setAddedCodes([]); setRemovedCodes([]); setNewProduct("");
  };
  const addProduct = () => {
    const typed = newProduct.trim();
    const code = (products.find(p => p.name === typed || p.code === typed.toUpperCase())?.code ?? typed).toUpperCase();
    if (!code) return;
    setAddedCodes(prev => prev.includes(code) ? prev : [...prev, code]);
    setRemovedCodes(prev => prev.filter(c => c !== code));
    setNewProduct("");
  };
  const removeProduct = (code: string) => {
    if (!draft) return;
    const idealBatchHours = { ...draft.idealBatchHours };
    delete idealBatchHours[code];
    setDraft({ ...draft, idealBatchHours });
    setAddedCodes(prev => prev.filter(c => c !== code));
    setRemovedCodes(prev => [...prev, code]);
  };
  const configuredRows = equipment.flatMap(eq => {
    const value = savedFor(eq);
    return value ? [{ eq, value }] : [];
  });
  async function removeConfig(eq: OeeEquipment, value: OeeSettings) {
    if (!window.confirm(`Delete the OEE configuration for ${eq.name}? Availability will become unavailable for it.`)) return;
    setDeletingKey(eq.id); setError("");
    try {
      await deleteOeeSettings({ tenantId: value.tenantId, plantId: value.plantId, equipmentId: value.equipmentId });
      onDeleted(value);
      if (eq.id === equipmentKey) {
        setDraft(blankDraft(eq));
        setAddedCodes([]); setRemovedCodes([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete OEE settings.");
    } finally {
      setDeletingKey("");
    }
  }

  const setShifts = (scheduledShifts: ShiftId[]) => draft && setDraft({ ...draft, scheduledShifts, downtimeComplete: false });
  const setWeekdays = (scheduledWeekdays: number[]) => draft && setDraft({ ...draft, scheduledWeekdays, downtimeComplete: false });
  const applyAllSuggestions = () => {
    if (!draft) return;
    const idealBatchHours = { ...draft.idealBatchHours };
    suggestions.forEach((s, code) => { if (s.hours && idealBatchHours[code] === undefined) idealBatchHours[code] = s.hours; });
    setDraft({ ...draft, idealBatchHours });
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setError("");
    if (!draft.fromDate || !draft.toDate || draft.fromDate > draft.toDate) {
      setError("Step 2: choose an Effective from date that is on or before the Effective through date.");
      return;
    }
    if (!draft.scheduledShifts.length || !draft.scheduledWeekdays.length) {
      setError("Step 3: select at least one production shift and one weekday.");
      return;
    }
    try {
      new Intl.DateTimeFormat("en", { timeZone: draft.timeZone.trim() });
    } catch {
      setError(`Step 2: "${draft.timeZone}" is not a valid IANA timezone (e.g. Asia/Kolkata).`);
      return;
    }
    setSaving(true);
    try {
      onSaved(await saveOeeSettings({ ...draft, timeZone: draft.timeZone.trim() }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save OEE settings.");
    } finally {
      setSaving(false);
    }
  }

  const step = (n: number, title: string, hint: string) => <div className="flex items-start gap-2">
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">{n}</span>
    <div><p className="font-semibold text-slate-900">{title}</p><p className="text-slate-500">{hint}</p></div>
  </div>;
  const preset = (label: string, onClick: () => void) => <button type="button" onClick={onClick}
    className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100">{label}</button>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="oee-settings-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 space-y-4 text-xs">
        <div>
          <h2 id="oee-settings-title" className="text-base font-bold">Configure OEE inputs</h2>
          <p className="text-slate-600">Tell the system when each machine is planned to run and how long a lot should ideally take.
            Availability needs steps 1–3 and 5; Performance uses step 4 when set (otherwise it is estimated from ingested reports).</p>
          {onImportCsv && <p className="mt-1 text-slate-600">Configuring many machines?{" "}
            <button type="button" onClick={onImportCsv} className="font-semibold text-indigo-700 underline">Upload a config CSV instead</button>
            {" "}(<a href="/samples/oee-config-sample.csv" download className="font-semibold text-indigo-700 underline">download sample</a>).</p>}
        </div>

        <section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
          <p className="font-semibold text-slate-900">Saved configurations ({configuredRows.length})</p>
          {configuredRows.length ? <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-500"><tr>
                <th className="py-1 pr-2">Equipment</th><th className="pr-2">Effective</th><th className="pr-2">Shifts / days</th>
                <th className="pr-2">Products</th><th className="pr-2">Downtime</th><th className="text-right">Actions</th>
              </tr></thead>
              <tbody>{configuredRows.map(({ eq, value }) => <tr key={eq.id}
                className={`border-t border-slate-200 ${eq.id === equipmentKey ? "bg-indigo-100/60" : ""}`}>
                <td className="py-1 pr-2 font-medium text-slate-800">{eq.name}<span className="text-slate-500"> · {eq.plantId}</span></td>
                <td className="pr-2">{value.fromDate} → {value.toDate}</td>
                <td className="pr-2">{value.scheduledShifts.length} shift(s) · {value.scheduledWeekdays.map(d => WEEKDAYS[d]).join(", ")}</td>
                <td className="pr-2">{Object.keys(value.idealBatchHours ?? {}).length}</td>
                <td className="pr-2">{value.downtimeComplete ? "Complete" : "Not confirmed"}</td>
                <td className="whitespace-nowrap text-right">
                  <button type="button" disabled={saving || !!deletingKey} onClick={() => selectEquipment(eq)}
                    className="mr-2 font-semibold text-indigo-700 hover:underline disabled:opacity-50">
                    {eq.id === equipmentKey ? "Editing" : "View / Edit"}</button>
                  <button type="button" disabled={saving || !!deletingKey} onClick={() => removeConfig(eq, value)}
                    className="font-semibold text-red-700 hover:underline disabled:opacity-50">
                    {deletingKey === eq.id ? "Deleting..." : "Delete"}</button>
                </td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="text-slate-500">No equipment is configured yet. Use the form below to add one.</p>}
        </section>

        <section className="space-y-2 rounded-xl border border-slate-200 p-3">
          {step(1, "Choose equipment", "Each equipment has its own schedule. Repeat for every machine you want in plant OEE.")}
          <select className={inputClass} value={equipmentKey} disabled={saving} onChange={e => {
            const eq = equipment.find(item => item.id === e.target.value);
            if (eq) selectEquipment(eq);
          }}>
            {equipment.map(eq => <option key={eq.id} value={eq.id}>
              {eq.name} - {eq.plantId}{savedFor(eq) ? " (configured)" : " (not configured)"}</option>)}
          </select>
          <p className={saved ? "text-emerald-700" : "text-amber-700"}>
            {saved ? `Saved schedule covers ${saved.fromDate} to ${saved.toDate}. Dates outside this range show "No schedule".`
              : "No saved schedule yet: Availability is unavailable for this equipment until you save one."}
          </p>
        </section>

        {draft && <>
          <section className="space-y-2 rounded-xl border border-slate-200 p-3">
            {step(2, "Effective dates and timezone", "The schedule applies only to production dates inside this range. Use a wide range (e.g. the whole year) if the plan does not change.")}
            <div className="grid grid-cols-2 gap-3">
              <label>Effective from<input required type="date" className={inputClass} value={draft.fromDate}
                onChange={e => setDraft({ ...draft, fromDate: e.target.value, downtimeComplete: false })} /></label>
              <label>Effective through<input required type="date" className={inputClass} min={draft.fromDate} value={draft.toDate}
                onChange={e => setDraft({ ...draft, toDate: e.target.value, downtimeComplete: false })} /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              {preset("Use selected dashboard range", () => setDraft({ ...draft, fromDate, toDate, downtimeComplete: false }))}
              {preset("Whole current year", () => {
                const year = (toDate || new Date().toISOString()).slice(0, 4);
                setDraft({ ...draft, fromDate: `${year}-01-01`, toDate: `${year}-12-31`, downtimeComplete: false });
              })}
            </div>
            <label className="block">Plant timezone (IANA, e.g. Asia/Kolkata)
              <input required className={inputClass} value={draft.timeZone}
                onChange={e => setDraft({ ...draft, timeZone: e.target.value, downtimeComplete: false })} />
            </label>
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 p-3">
            {step(3, "Planned production shifts and weekdays", "Scheduled time = selected shifts × selected weekdays. Unselected time is not counted as lost.")}
            <div className="flex flex-wrap gap-2">
              {preset("24h (all 3 shifts)", () => setShifts(DEFAULT_SHIFTS.map(s => s.id)))}
              {preset("Day shifts (1 + 2)", () => setShifts(["Shift 1", "Shift 2"]))}
              {preset("Mon–Sat", () => setWeekdays([1, 2, 3, 4, 5, 6]))}
              {preset("Mon–Fri", () => setWeekdays([1, 2, 3, 4, 5]))}
              {preset("All 7 days", () => setWeekdays([0, 1, 2, 3, 4, 5, 6]))}
            </div>
            <div className="flex flex-wrap gap-4">
              {DEFAULT_SHIFTS.map(shift => <label key={shift.id} className="flex items-center gap-2">
                <input type="checkbox" checked={draft.scheduledShifts.includes(shift.id)} onChange={e => setShifts(e.target.checked
                  ? [...draft.scheduledShifts, shift.id] : draft.scheduledShifts.filter(s => s !== shift.id))} />{shift.name}
              </label>)}
            </div>
            <div className="flex flex-wrap gap-3">{WEEKDAYS.map((name, day) =>
              <label key={name} className="flex items-center gap-1"><input type="checkbox" checked={draft.scheduledWeekdays.includes(day)}
                onChange={e => setWeekdays(e.target.checked ? [...draft.scheduledWeekdays, day]
                  : draft.scheduledWeekdays.filter(d => d !== day))} />{name}</label>)}</div>
          </section>

          <section className="space-y-2 rounded-xl border border-slate-200 p-3">
            {step(4, "Ideal hours per lot (optional)", "The validated time one lot should take at rated speed. Rows marked “Req. Config” on the dashboard need this. Suggestions come from ingested batches – review before saving.")}
            {codes.length > 0 && <div className="flex justify-end">{preset("Fill empty rows with suggestions", applyAllSuggestions)}</div>}
            {codes.map(code => {
              const suggestion = suggestions.get(code);
              return <div key={code} className="grid grid-cols-[1fr_8rem_auto_auto] items-center gap-2">
                <div><p className="font-medium text-slate-800">{productName(code)}</p>
                  {suggestion?.hours && <p className="text-[11px] text-slate-500">Suggested {suggestion.hours} h ({suggestion.basis})</p>}</div>
                <input aria-label={`Ideal hours for ${code}`} type="number" min="0.000001" step="any" className={inputClass}
                  placeholder="hours" value={draft.idealBatchHours[code] ?? ""} onChange={e => {
                    const idealBatchHours = { ...draft.idealBatchHours };
                    if (!e.target.value) delete idealBatchHours[code];
                    else idealBatchHours[code] = Number(e.target.value);
                    setDraft({ ...draft, idealBatchHours });
                  }} />
                {suggestion?.hours ? preset("Use", () => setDraft({ ...draft,
                  idealBatchHours: { ...draft.idealBatchHours, [code]: suggestion.hours! } })) : <span />}
                <button type="button" aria-label={`Remove ${code}`} onClick={() => removeProduct(code)}
                  className="rounded-md border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50">Remove</button>
              </div>;
            })}
            {!codes.length && <p className="text-slate-500">No products on this configuration yet. Add one below.</p>}
            <div className="flex gap-2 border-t border-slate-100 pt-2">
              <input list="oee-product-options" className={inputClass} placeholder="Add product (pick from list or type a product code)"
                value={newProduct} onChange={e => setNewProduct(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addProduct(); } }} />
              <datalist id="oee-product-options">
                {addableProducts.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
              </datalist>
              <button type="button" onClick={addProduct} disabled={!newProduct.trim()}
                className="shrink-0 rounded-lg border border-indigo-300 bg-indigo-50 px-3 font-semibold text-indigo-700 disabled:opacity-50">Add product</button>
            </div>
          </section>

          <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            {step(5, "Confirm downtime is complete", "Tick only after all planned and unplanned stops for the date range are recorded (manually or via CSV import). Without it Availability stays unavailable, because missing downtime would overstate it.")}
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={draft.downtimeComplete} onChange={e => setDraft({ ...draft, downtimeComplete: e.target.checked })} />
              <span>All downtime for this equipment between {draft.fromDate} and {draft.toDate} has been recorded.</span>
            </label>
          </section>
        </>}
        <p className="text-slate-500">Production dates run 06:00 to 06:00 the next day; Shift 3 belongs to its starting date.
          Times use the saved plant timezone. Saved changes include the authenticated user and update time.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2">Cancel</button>
          <button type="submit" disabled={!draft || saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save inputs"}
          </button>
        </div>
      </form>
    </div>
  );
}
