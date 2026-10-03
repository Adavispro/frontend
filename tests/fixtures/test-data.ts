export const TEST_CREDENTIALS = {
  username: "super_admin",
  password: "Adavis@123",
};

export const DEFAULT_CONTEXT = {
  tenantId: "TNT-0001",
  plantId: "PLNT-0001",
};

export function generateTestId(prefix: string): string {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `${prefix}_${ts}${rand}`;
}
