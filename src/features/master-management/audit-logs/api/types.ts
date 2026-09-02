import type { z } from "zod";
import type {
  auditActionQuerySchema,
  auditCountByActionQuerySchema,
  auditCountSchema,
  auditEntityQuerySchema,
  auditListQuerySchema,
  auditLogSchema,
  auditLogsArraySchema,
  auditLogsPageSchema,
  auditLogsResultSchema,
  auditTenantQuerySchema,
  createAuditLogRequestSchema,
} from "../schemas";

export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogsArray = z.infer<typeof auditLogsArraySchema>;
export type AuditLogsPage = z.infer<typeof auditLogsPageSchema>;
export type AuditLogsResult = z.infer<typeof auditLogsResultSchema>;
export type AuditListQuery = {
  page?: number;
  size?: number;
  tenantId?: string;
  userId?: string;
};
export type AuditEntityQuery = {
  entity: string;
  entityId: string;
};
export type AuditActionQuery = AuditListQuery & {
  action: string;
  from?: string;
  to?: string;
};
export type AuditTenantQuery = AuditListQuery & {
  from?: string;
  to?: string;
};
export type AuditCountByActionQuery = z.infer<
  typeof auditCountByActionQuerySchema
>;
export type AuditCount = z.infer<typeof auditCountSchema>;
export type CreateAuditLogRequest = z.infer<typeof createAuditLogRequestSchema>;
