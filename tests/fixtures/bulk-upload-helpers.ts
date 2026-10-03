import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface CsvFileOptions {
  headers: string[];
  rows: (string | number | boolean)[][];
}

export function createCsvBuffer(options: CsvFileOptions): Buffer {
  const lines: string[] = [];
  lines.push(options.headers.map(escapeCsvValue).join(","));
  for (const row of options.rows) {
    lines.push(row.map(escapeCsvValue).join(","));
  }
  return Buffer.from(lines.join("\n"), "utf-8");
}

export function createTempCsvFile(filename: string, options: CsvFileOptions): string {
  const tempDir = path.join(os.tmpdir(), "adavis-bulk-tests");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filePath = path.join(tempDir, filename);
  const buffer = createCsvBuffer(options);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function createTempRawFile(filename: string, content: Buffer | string): string {
  const tempDir = path.join(os.tmpdir(), "adavis-bulk-tests");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const TEMPLATE_HEADERS: Record<string, string[]> = {
  TENANT: ["tenantCode", "tenantName", "status", "contactEmail", "contactPhone", "region", "domain"],
  PLANT: ["plantCode", "plantName", "type", "isActive", "blockCode", "blockName", "areaCode", "areaName", "roomCode", "roomName"],
  DEPARTMENT: ["departmentCode", "departmentName", "description", "plantCode", "parentDepartmentCode", "isActive"],
  ROLE: ["roleCode", "roleName", "description", "isActive"],
  USER: ["username", "email", "firstName", "lastName", "departmentCode", "designation", "initialPassword", "title", "userType", "empId", "isActive"],
  USER_GROUP: ["groupCode", "groupName", "description", "isActive"],
  USER_GROUP_ASSIGNMENT: ["username", "groupCode", "assignedBy", "reason", "isActive"],
  IIOT_MASTER: ["equipmentCode", "equipmentName", "equipmentType", "lineId", "roomCode", "status", "isActive"],
};
