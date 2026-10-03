import { APIRequestContext } from "@playwright/test";
import { TEST_CREDENTIALS } from "../fixtures/test-data";

export async function getAuthCookies(request: APIRequestContext) {
  const loginRes = await request.post("/api/auth/login", {
    data: {
      identifier: TEST_CREDENTIALS.username,
      password: TEST_CREDENTIALS.password,
    },
  });
  return loginRes.ok();
}

export async function deleteEquipmentApi(request: APIRequestContext, equipmentId: string) {
  try {
    await request.delete(`/api/master-management/iiot/equipment-master/${encodeURIComponent(equipmentId)}`);
  } catch {}
}

export async function deleteProductApi(request: APIRequestContext, productId: string) {
  try {
    await request.delete(`/api/master-management/iiot/product-master/${encodeURIComponent(productId)}`);
  } catch {}
}

export async function deleteRecipeApi(request: APIRequestContext, recipeId: string) {
  try {
    await request.delete(`/api/master-management/iiot/recipe-master/${encodeURIComponent(recipeId)}`);
  } catch {}
}
