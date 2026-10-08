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
    plantName: "PB1 Production Plant",
    blockId: "BLK-0001",
    blockName: "PB1",
    areaId: "AREA-0001",
    areaName: "MODULE-B",
    roomNo: "RM-PB1-01",
    roomName: "Processing Room 01",
    status: "Running",
    stateReason: "RUNNING",
    lastBatchNo: "AGO0026016",
    lastLotNo: "01",
    lastActive: "Just now",
  },
  {
    id: "MB004",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Production Plant",
    blockId: "BLK-0001",
    blockName: "PB1",
    areaId: "AREA-0001",
    areaName: "MODULE-B",
    roomNo: "RM-PB1-01",
    roomName: "Processing Room 01",
    status: "Running",
    stateReason: "RUNNING",
    lastBatchNo: "AGO0026016",
    lastLotNo: "1B",
    lastActive: "Just now",
  },
  {
    id: "MB005",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Production Plant",
    blockId: "BLK-0001",
    blockName: "PB1",
    areaId: "AREA-0001",
    areaName: "MODULE-B",
    roomNo: "RM-PB1-01",
    roomName: "Processing Room 01",
    status: "Running",
    stateReason: "RUNNING",
    lastBatchNo: "AGO0026015",
    lastLotNo: "01",
    lastActive: "Just now",
  },
  {
    id: "MC081",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Production Plant",
    blockId: "BLK-0001",
    blockName: "PB1",
    areaId: "AREA-0001",
    areaName: "MODULE-B",
    roomNo: "RM-PB1-02",
    roomName: "Compression Room",
    status: "Running",
    stateReason: "RUNNING",
    lastBatchNo: "ADNC26011",
    lastLotNo: "01",
    lastActive: "Just now",
  },
  {
    id: "MB041",
    tenantId: "TNT-0001",
    plantId: "PLNT-0001",
    plantName: "PB1 Production Plant",
    blockId: "BLK-0001",
    blockName: "PB1",
    areaId: "AREA-0002",
    areaName: "COATING MODULE-B",
    roomNo: "RM-PB1-01",
    roomName: "Processing Room 01",
    status: "Running",
    stateReason: "RUNNING",
    lastBatchNo: "PED26009",
    lastLotNo: "01",
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
