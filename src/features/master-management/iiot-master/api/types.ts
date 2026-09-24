import type { z } from "zod";
import type {
  createCriticalParameterLimitSchema,
  createCriticalParameterSchema,
  createIiotAssetSchema,
  createProductMasterSchema,
  createRecipeMasterSchema,
  createRecipeManagementSchema,
  criticalParameterLimitSchema,
  criticalParametersSchema,
  criticalParameterSchema,
  iiotAssetsSchema,
  iiotAssetSchema,
  productMasterSchema,
  recipeMasterSchema,
  recipeMastersSchema,
  recipeManagementSchema,
  recipeManagementsSchema,
  updateCriticalParameterLimitSchema,
  updateCriticalParameterSchema,
  updateIiotAssetSchema,
  updateProductMasterSchema,
  updateRecipeMasterSchema,
  updateRecipeManagementSchema,
} from "../schemas";

export type IiotMasterSection =
  | "equipments"
  | "critical-parameters"
  | "critical-parameter-limits"
  | "product-master"
  | "recipe-master"
  | "recipe-management";

export type IiotAsset = z.infer<typeof iiotAssetSchema>;
export type IiotAssets = z.infer<typeof iiotAssetsSchema>;
export type CriticalParameter = z.infer<typeof criticalParameterSchema>;
export type CriticalParameters = z.infer<typeof criticalParametersSchema>;
export type CriticalParameterLimit = z.infer<typeof criticalParameterLimitSchema>;
export type ProductMaster = z.infer<typeof productMasterSchema>;
export type RecipeMaster = z.infer<typeof recipeMasterSchema>;
export type RecipeMasters = z.infer<typeof recipeMastersSchema>;
export type RecipeManagement = z.infer<typeof recipeManagementSchema>;
export type RecipeManagements = z.infer<typeof recipeManagementsSchema>;

export type CreateIiotAssetValues = z.infer<typeof createIiotAssetSchema>;
export type CreateCriticalParameterValues = z.infer<
  typeof createCriticalParameterSchema
>;
export type CreateCriticalParameterLimitValues = z.infer<
  typeof createCriticalParameterLimitSchema
>;
export type CreateProductMasterValues = z.infer<typeof createProductMasterSchema>;
export type CreateRecipeMasterValues = z.infer<typeof createRecipeMasterSchema>;
export type CreateRecipeManagementValues = z.infer<typeof createRecipeManagementSchema>;

export type UpdateIiotAssetValues = z.infer<typeof updateIiotAssetSchema>;
export type UpdateCriticalParameterValues = z.infer<
  typeof updateCriticalParameterSchema
>;
export type UpdateCriticalParameterLimitValues = z.infer<
  typeof updateCriticalParameterLimitSchema
>;
export type UpdateProductMasterValues = z.infer<typeof updateProductMasterSchema>;
export type UpdateRecipeMasterValues = z.infer<typeof updateRecipeMasterSchema>;
export type UpdateRecipeManagementValues = z.infer<typeof updateRecipeManagementSchema>;

export type IiotMasterRecord =
  | IiotAsset
  | CriticalParameter
  | CriticalParameterLimit
  | ProductMaster
  | RecipeMaster
  | RecipeManagement;
