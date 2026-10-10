# frontend
live link https://frontend-two-theta-25.vercel.app/

## IIoT OEE

The `/iiot/oee` page uses active equipment masters, live equipment statuses, plant/tenant
masters and paginated batch summaries. Product options come from recorded executions.
Equipment stages are counted by batch and lot; inactive placeholder stages and replayed
copies are excluded. A workflow return is not classified as a failed manufactured batch.

Use **Configure OEE** to save the equipment's effective production-date range, IANA plant
timezone, scheduled weekdays/shifts and validated ideal batch durations per product.
Use **Record Downtime** for planned and unplanned intervals. These inputs are stored by
the IIoT service, not in browser memory. Availability is available only after a user
confirms that the downtime log is complete for the configured range. Do not confirm
coverage before the underlying downtime has been reconciled.

The Configure OEE form walks through five steps: equipment, effective dates, shifts/weekdays,
ideal hours per product, then downtime confirmation. Ideal hours are suggested from the
median ingested runtime for each product. Click **Use** to accept a suggestion, or edit it.
Downtime entries can be edited or deleted from **Downtime Log**. **Import Downtime CSV**
accepts up to 1000 rows and rejects the whole file if any row is invalid. Columns:
`equipmentId,tenantId,plantId,date,startTime,endTime,classification,category,reason,comments,timeZone`.
A sample file is at `public/samples/oee-downtime-sample.csv`.

**Import Config CSV** sets up many equipment items at once. Use one row per equipment and
product. Columns:
`equipmentId,tenantId,plantId,effectiveFrom,effectiveTo,timeZone,shifts,weekdays,downtimeComplete,productCode,idealHours`.
Accepted values:
- `shifts`: `24h` or `1;2;3`.
- `weekdays`: `all`, `Mon;Tue`, or `0`–`6` where 0 is Sunday.

Repeat the same schedule columns on every row for an equipment item. Leave `productCode`
empty for a schedule-only row. Each equipment item is saved separately: its schedule is
replaced, and ideal hours for products not in the file are kept. A sample file is at
`public/samples/oee-config-sample.csv`.

Ranges can be longer than the saved schedule, for example Last 3 Months with only one
scheduled week. In that case availability uses only the scheduled days, and the Availability
card shows how many days are covered. Unscheduled days are excluded, not counted as lost time.
Performance and quality still use every batch in the range. An equipment item with no
schedule overlap shows "No schedule".

- Production dates run 06:00 to 06:00 the following day in the saved plant timezone.
  Shift 3 (22:00-06:00) belongs to its starting production date.
- Current periods are clipped at the calculation snapshot time. Use **Refresh** to
  reload source data and update the snapshot. Custom ranges include both dates and
  are limited to 366 production days.
- Availability = operating time / (scheduled time - planned downtime).
  Operating time = scheduled time - planned downtime - unplanned downtime, using
  the confirmed downtime log; it is not inferred from elapsed batch time.
- Performance = sum of validated ideal batch durations / sum of actual elapsed
  durations of complete batch/lot executions (bounded to 100%). Aggregation is
  duration-weighted, not an average of equipment percentages.
- Validated quality = good/released executions / completed executions. Completion
  alone is not QA approval.
- With missing validated inputs, the page calculates explicitly **Estimated OEE**
  from existing ingestion evidence. Compression uses good/total tablet counters,
  report running time and reported capacity (not rated ideal speed). Other machines
  use the median duration of other ingested executions for the same equipment/product,
  falling back to an explicitly identified mixed-product equipment baseline.
  Same-time lot aliases and the current batch are excluded from the baseline.
  This descriptive full-history baseline is not a validated recipe duration.
- Estimated quality uses measurable CPP readings against the critical limits effective
  at each observation (including source metric spelling aliases). Unmapped parameters
  are excluded; recorded shutdown readings may be included. This measures logged CPP
  compliance, not manufactured product yield or QA release. Quality indicators are
  averaged per completed execution, rather than pooling tablets and CPP samples.
  Final manufacturing outcomes and configured ideals take precedence. All executions
  need evidence; missing evidence remains unavailable, never assumed to be 100%.
- Overlapping downtime is merged, clipped to configured schedules, and not counted
  twice. Planned intervals take precedence where classifications overlap.
- Product filtering changes performance and quality; availability and downtime
  remain equipment-wide. Daily and shift results use the same calculation engine.
- Missing inputs and failed requests are displayed explicitly. No sample batches,
  sample downtime, assumed ideal durations or generated trend variances are used.

Explicitly seeded testing inputs carry `isTestData: true`. Compact, expandable
calculation details identify estimates and test schedules/downtime without large
yellow banners; their availability/utilization must not be used as production KPIs.
Date/filter changes run OEE, daily trends and downtime-window calculations in a
Web Worker. Filters remain interactive while results update; stale worker replies
are discarded, and worker failures are displayed explicitly. Timezone conversions
are cached with a bounded cache, schedule windows are reused per equipment, and
daily trend calculations omit unused shift breakdowns.

Targeted calculation tests:

```powershell
npx tsx --test src\features\iiot\analytics\utils\oee-engine.test.ts src\features\iiot\analytics\utils\oee-data.test.ts src\features\iiot\analytics\utils\oee-evidence.test.ts
```
