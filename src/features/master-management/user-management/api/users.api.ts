import {
  apiClient,
  APP_API_ENDPOINTS,
  ensureApiSuccess,
  parseApiData,
  withQuery,
} from "@/api";
import type { BackendApiResponse } from "@/api/types";
import { userSchema, usersPageSchema } from "../schemas";
import type {
  CreateUserRequest,
  User,
  UsersListQuery,
  UsersPage,
  UpdateUserRequest,
} from "./types";

export const getUsers = async (
  query: UsersListQuery,
  signal?: AbortSignal,
) => {
  const result = await apiClient<BackendApiResponse<UsersPage>>(
    withQuery(APP_API_ENDPOINTS.masterManagement.users, query),
    { signal },
  );
  return parseApiData(
    result,
    usersPageSchema,
    "Unable to load users.",
    "The user service returned an invalid response.",
  );
};

export const createUser = async (request: CreateUserRequest) => {
  const result = await apiClient<BackendApiResponse<User>, CreateUserRequest>(
    APP_API_ENDPOINTS.masterManagement.users,
    { method: "POST", body: request },
  );
  return parseApiData(
    result,
    userSchema,
    "Unable to create user.",
    "The user service returned an invalid response.",
  );
};

export const getUser = async (userId: string, signal?: AbortSignal) => {
  const result = await apiClient<BackendApiResponse<User>>(
    APP_API_ENDPOINTS.masterManagement.userDetail(userId),
    { signal },
  );
  return parseApiData(
    result,
    userSchema,
    "Unable to load user.",
    "The user service returned an invalid response.",
  );
};

export const updateUser = async (
  userId: string,
  request: UpdateUserRequest,
) => {
  const result = await apiClient<BackendApiResponse<User>, UpdateUserRequest>(
    APP_API_ENDPOINTS.masterManagement.userDetail(userId),
    { method: "PUT", body: request },
  );
  return parseApiData(
    result,
    userSchema,
    "Unable to update user.",
    "The user service returned an invalid response.",
  );
};

export const deleteUser = async (
  userId: string,
  auth?: { remarks: string; password: string },
) => {
  const result = await apiClient<
    BackendApiResponse<null>,
    { remarks?: string; password?: string; esignPassword?: string }
  >(
    APP_API_ENDPOINTS.masterManagement.userDetail(userId),
    {
      method: "DELETE",
      body: auth
        ? {
            remarks: auth.remarks,
            password: auth.password,
            esignPassword: auth.password,
          }
        : undefined,
    },
  );
  ensureApiSuccess(result, "Unable to delete user.");
  return result;
};

export type UserLifecycleAction = "activate" | "reactivate" | "deactivate" | "block" | "unblock";

export const changeUserLifecycle = async (
  userId: string,
  action: UserLifecycleAction,
  auth?: { remarks: string; password: string },
) => {
  const result = await apiClient<
    BackendApiResponse<User>,
    {
      action: UserLifecycleAction;
      reason: string;
      remarks?: string;
      password?: string;
      esignPassword?: string;
    }
  >(
    APP_API_ENDPOINTS.masterManagement.userLifecycle(userId),
    {
      method: "PATCH",
      body: {
        action,
        reason: auth?.remarks || `User status changed to ${action}.`,
        remarks: auth?.remarks,
        password: auth?.password,
        esignPassword: auth?.password,
      },
    },
  );
  return parseApiData(
    result,
    userSchema,
    "Unable to change user status.",
    "The user service returned an invalid response.",
  );
};

export const resetManagedUserPassword = async (
  userId: string,
  tempPassword: string,
) => {
  const result = await apiClient<BackendApiResponse<Record<string, unknown>>>(
    APP_API_ENDPOINTS.masterManagement.userPasswordReset(userId),
    {
      method: "POST",
      body: {
        tempPassword,
        reason: "Password reset requested by an administrator",
      },
    },
  );
  ensureApiSuccess(result, "Unable to reset user password.");
  return result;
};

export const assignUserToGroup = async (
  groupId: string,
  userId: string,
  assignedBy: string,
) => {
  const result = await apiClient<BackendApiResponse<unknown>>(
    `/api/master-management/mdm/user-groups/${encodeURIComponent(groupId)}/users`,
    {
      method: "POST",
      body: { userId, assignedBy },
    },
  );
  ensureApiSuccess(result, "Unable to assign the user group.");
  return result;
};
