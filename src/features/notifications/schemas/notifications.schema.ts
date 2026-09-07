import { z } from "zod";

export const notificationItemSchema = z.object({
  id: z.string().optional(),
  notificationId: z.string(),
  recipientUserId: z.string(),
  tenantId: z.string().optional().nullable(),
  plantId: z.string().optional().nullable(),
  type: z.string(),
  eventCode: z.string(),
  title: z.string(),
  message: z.string(),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  batchNo: z.string().optional().nullable(),
  lotNo: z.string().optional().nullable(),
  equipmentCode: z.string().optional().nullable(),
  workflowState: z.string().optional().nullable(),
  severity: z.enum(["INFO", "WARNING", "SUCCESS", "ERROR"]).or(z.string()),
  isRead: z.boolean(),
  createdAt: z.string(),
  readAt: z.string().optional().nullable(),
  actorUserId: z.string().optional().nullable(),
  deepLink: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  assignedRole: z.string().optional().nullable(),
  assignmentScope: z.string().optional().nullable(),
});

export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationItemSchema),
  total: z.number(),
  unreadCount: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const unreadCountResponseSchema = z.object({
  unreadCount: z.number(),
  userId: z.string().optional(),
});

export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;
