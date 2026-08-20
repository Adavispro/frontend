"use client";

import { useState } from "react";
import { DownloadSimple, UploadSimple, CheckCircle, WarningCircle, ArrowClockwise, FileCsv } from "@phosphor-icons/react";
import { Snackbar } from "@/components/ui";

const ENTITY_OPTIONS = [
  { id: "TENANT", label: "Tenant Master", description: "Companies, organizations, and tenant codes" },
  { id: "PLANT", label: "Plant Topology", description: "Plants, Blocks, Areas, and Rooms hierarchy" },
  { id: "DEPARTMENT", label: "Department Master", description: "Organizational departments and codes" },
  { id: "ROLE", label: "Role Master", description: "System and operational roles" },
  { id: "USER", label: "User Accounts", description: "User profiles, emails, designations, and initial credentials" },
  { id: "USER_GROUP", label: "User Groups", description: "Permission and authorization user groups" },
  { id: "USER_GROUP_ASSIGNMENT", label: "User Group Assignments", description: "Mapping users to operational groups" },
  { id: "IIOT_MASTER", label: "IIoT Equipment Master", description: "Manufacturing lines, equipment codes, and types" },
];

export default function BulkUploadScreen() {
  const [selectedType, setSelectedType] = useState<string>("USER");
  const [uploadMode, setUploadMode] = useState<"UPDATE" | "TRUNCATE_AND_LOAD">("UPDATE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [notification, setNotification] = useState<{ message: string; variant: "success" | "error" }>({
    message: "",
    variant: "success",
  });

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(`/api/master-management/bulk-upload/template/${selectedType}`);
      if (!res.ok) throw new Error("Failed to download template");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedType.toLowerCase()}_template.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setNotification({ message: `Downloaded ${selectedType} template CSV`, variant: "success" });
    } catch (err: any) {
      setNotification({ message: err.message || "Failed to download template", variant: "error" });
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setNotification({ message: "Please select a CSV file to upload", variant: "error" });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append("type", selectedType);
    formData.append("mode", uploadMode);
    formData.append("tenantId", "TNT-0001");
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/master-management/bulk-upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setUploadResult(json.data);
        if (json.data.errorCount === 0) {
          setNotification({
            message: `Successfully processed ${json.data.successCount} ${selectedType} records!`,
            variant: "success",
          });
        } else {
          setNotification({
            message: `Bulk upload completed with ${json.data.errorCount} validation errors.`,
            variant: "error",
          });
        }
      } else {
        setUploadResult(json.data || { status: "FAILED", errors: [{ rowNumber: 0, column: "ALL", error: json.message }] });
        setNotification({ message: json.message || "Upload failed validation", variant: "error" });
      }
    } catch (err: any) {
      setNotification({ message: err.message || "Upload network error", variant: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master Data Bulk Upload & Sync</h1>
          <p className="text-sm text-gray-500 mt-1">
            Standardized CSV bulk import with schema validation, update modes, and audit logging.
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-sm"
        >
          <DownloadSimple size={18} />
          Download {selectedType} Template
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Step 1 & 2: Configuration */}
        <div className="md:col-span-1 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">1. Select Target Master Entity</label>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setUploadResult(null);
              }}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.id})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1.5">
              {ENTITY_OPTIONS.find((o) => o.id === selectedType)?.description}
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">2. Select Upload Mode</label>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition">
                <input
                  type="radio"
                  name="mode"
                  value="UPDATE"
                  checked={uploadMode === "UPDATE"}
                  onChange={() => setUploadMode("UPDATE")}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">UPDATE (Upsert / Merge)</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Inserts new records and updates matching identifiers without deleting existing records.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 border border-red-200 rounded-lg cursor-pointer hover:bg-red-50/50 transition">
                <input
                  type="radio"
                  name="mode"
                  value="TRUNCATE_AND_LOAD"
                  checked={uploadMode === "TRUNCATE_AND_LOAD"}
                  onChange={() => setUploadMode("TRUNCATE_AND_LOAD")}
                  className="mt-0.5 text-red-600 focus:ring-red-500"
                />
                <div>
                  <span className="text-sm font-medium text-red-700">TRUNCATE & LOAD (Full Replace)</span>
                  <p className="text-xs text-red-500 mt-0.5">
                    Clears all existing tenant records in this collection and loads only the rows in the CSV.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Step 3: File Selection & Actions */}
        <div className="md:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
          <form onSubmit={handleFileUpload} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">3. Upload Data File (.CSV)</label>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition bg-gray-50/50">
                <FileCsv size={48} className="mx-auto text-blue-500 mb-3" />
                <p className="text-sm font-medium text-gray-700 mb-1">
                  {selectedFile ? selectedFile.name : "Click or drag & drop CSV file here"}
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "UTF-8 formatted CSV files only"}
                </p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                      setUploadResult(null);
                    }
                  }}
                  className="hidden"
                  id="csv-file-input"
                />
                <label
                  htmlFor="csv-file-input"
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition shadow-sm inline-block"
                >
                  Choose CSV File
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setUploadResult(null);
                  }}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Clear
                </button>
              )}
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition shadow-sm"
              >
                {isUploading ? (
                  <>
                    <ArrowClockwise size={18} className="animate-spin" />
                    Validating & Ingesting...
                  </>
                ) : (
                  <>
                    <UploadSimple size={18} />
                    Process Bulk Upload
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Upload Results & Error Breakdown */}
      {uploadResult && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {uploadResult.status === "SUCCESS" ? (
                <CheckCircle size={28} className="text-emerald-500" />
              ) : (
                <WarningCircle size={28} className="text-amber-500" />
              )}
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {uploadResult.status === "SUCCESS" ? "Upload Succeeded" : "Upload Validation Results"}
                </h2>
                <p className="text-sm text-gray-500">{uploadResult.message}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="text-center px-4 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                <span className="block text-xs text-gray-500 font-medium">Total Rows</span>
                <span className="text-base font-bold text-gray-800">{uploadResult.totalRows}</span>
              </div>
              <div className="text-center px-4 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                <span className="block text-xs text-emerald-600 font-medium">Ingested</span>
                <span className="text-base font-bold text-emerald-700">{uploadResult.successCount}</span>
              </div>
              <div className="text-center px-4 py-1.5 bg-red-50 rounded-lg border border-red-100">
                <span className="block text-xs text-red-600 font-medium">Errors</span>
                <span className="text-base font-bold text-red-700">{uploadResult.errorCount}</span>
              </div>
            </div>
          </div>

          {/* Errors Table if any */}
          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-red-700 mb-2">Row-Level Error Details:</h3>
              <div className="overflow-x-auto rounded-lg border border-red-100">
                <table className="w-full text-left text-sm">
                  <thead className="bg-red-50 text-red-800 text-xs font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Row #</th>
                      <th className="px-4 py-2.5">Column / Field</th>
                      <th className="px-4 py-2.5">Validation Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100 text-gray-700 bg-white">
                    {uploadResult.errors.map((err: any, idx: number) => (
                      <tr key={idx} className="hover:bg-red-50/30">
                        <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-500">
                          {err.rowNumber === 0 ? "Header" : `Row ${err.rowNumber}`}
                        </td>
                        <td className="px-4 py-2 font-semibold text-gray-800">{err.column || "-"}</td>
                        <td className="px-4 py-2 text-red-600">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {notification.message && (
        <Snackbar
          open={!!notification.message}
          message={notification.message}
          variant={notification.variant}
          onClose={() => setNotification({ message: "", variant: "success" })}
        />
      )}
    </div>
  );
}
