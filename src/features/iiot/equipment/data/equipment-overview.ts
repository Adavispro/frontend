export type EquipmentStatus =
  | "Running"
  | "Idle"
  | "Communication Error"
  | "Maintenance"
  | "Offline";

export type EquipmentStatusFilter =
  | "all"
  | "running"
  | "idle"
  | "communication-error"
  | "maintenance"
  | "offline";

export interface EquipmentRow {
  id: string;
  tenantId: string;
  plantId: string;
  plantName?: string;
  blockId: string;
  blockName?: string;
  areaId: string;
  areaName?: string;
  roomNo: string;
  roomName?: string;
  status: EquipmentStatus;
  stateReason: string;
  lastBatchNo: string;
  lastLotNo: string;
  lastActive: string;
}

export const equipmentRows: EquipmentRow[] = [
  {
    id: "MB003",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Plant",
    blockId: "PB1",
    blockName: "Granulation Block PB1",
    areaId: "MODULE-B",
    areaName: "Granulation Module-B",
    roomNo: "ROOM-101",
    roomName: "RMG Suite",
    status: "Running",
    stateReason: "RUNNING - Granulation In Progress",
    lastBatchNo: "AGO0026016",
    lastLotNo: "01",
    lastActive: "Just now",
  },
  {
    id: "MB004",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Plant",
    blockId: "PB1",
    blockName: "Drying Block PB1",
    areaId: "MODULE-B",
    areaName: "Drying Module-B",
    roomNo: "ROOM-102",
    roomName: "FBD Suite",
    status: "Running",
    stateReason: "RUNNING - Fluid Bed Drying In Progress",
    lastBatchNo: "AGO0026016",
    lastLotNo: "1B",
    lastActive: "Just now",
  },
  {
    id: "MB005",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Plant",
    blockId: "PB1",
    blockName: "Blending Block PB1",
    areaId: "MODULE-B",
    areaName: "Blending Module-B",
    roomNo: "ROOM-103",
    roomName: "Blender Suite",
    status: "Running",
    stateReason: "RUNNING - Octagonal Blending In Progress",
    lastBatchNo: "AGO0026015",
    lastLotNo: "01",
    lastActive: "Just now",
  },
  {
    id: "MB040",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Plant",
    blockId: "PB1",
    blockName: "Compression Block PB1",
    areaId: "MODULE-B",
    areaName: "Compression Module-B",
    roomNo: "ROOM-104",
    roomName: "Compression Suite",
    status: "Running",
    stateReason: "RUNNING - Tablet Compression In Progress",
    lastBatchNo: "Pb1 Mb Compression",
    lastLotNo: "01",
    lastActive: "Just now",
  },
  {
    id: "MB041",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Plant",
    blockId: "PB1",
    blockName: "Coating Block PB1",
    areaId: "COATING MODULE-B",
    areaName: "Coating Module-B",
    roomNo: "ROOM-105",
    roomName: "Auto Coater Suite",
    status: "Running",
    stateReason: "RUNNING - Auto Coating In Progress",
    lastBatchNo: "PED26009",
    lastLotNo: "NA",
    lastActive: "Just now",
  },
];

export const equipmentStatusLabels: Record<EquipmentStatusFilter, string> = {
  all: "Total Equipment",
  running: "Running Equipment",
  idle: "Idle Equipment",
  "communication-error": "Communication Error Equipment",
  maintenance: "Equipment Under Maintenance",
  offline: "Offline Equipment",
};

const equipmentStatusByFilter: Record<
  Exclude<EquipmentStatusFilter, "all">,
  EquipmentStatus
> = {
  running: "Running",
  idle: "Idle",
  "communication-error": "Communication Error",
  maintenance: "Maintenance",
  offline: "Offline",
};

export const filterEquipmentRows = (filter: EquipmentStatusFilter) =>
  filter === "all"
    ? equipmentRows
    : equipmentRows.filter(
        (equipment) => equipment.status === equipmentStatusByFilter[filter],
      );
