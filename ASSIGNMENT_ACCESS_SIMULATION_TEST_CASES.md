# Assignment and Access Simulation Test Cases

## Scope
Validate user-group assignment behavior, plant mapping behavior, and module access isolation for test users created under tenant `TNT-0001`.

## Test Data Created
- Users
  - `TEST_USER_1` / `Adavis@123`
  - `TEST_USER_2` / `Adavis@123`
  - `TEST_USER_3` / `Adavis@123`
- Roles
  - `TEST_ROLE_1`: MDM only
  - `TEST_ROLE_2`: IIOT only
  - `TEST_ROLE_3`: MDM + IIOT
- Groups
  - `TEST_GROUP_1`
  - `TEST_GROUP_2`
  - `TEST_GROUP_3`
- Plants
  - `TEST_PLANTS_1`
  - `TEST_PLANTS_2`
  - `TEST_PLANTS_3`
- Mappings
  - `TEST_GROUP_1` -> `TEST_PLANTS_1`
  - `TEST_GROUP_2` -> `TEST_PLANTS_1`
  - `TEST_USER_2` override -> `TEST_PLANTS_2`
  - `TEST_GROUP_3` -> `TEST_PLANTS_3`

## Role/Group/User Mapping Matrix
- `TEST_GROUP_1` -> role `TEST_ROLE_1` -> user `TEST_USER_1`
- `TEST_GROUP_2` -> role `TEST_ROLE_2` -> user `TEST_USER_2`
- `TEST_GROUP_3` -> role `TEST_ROLE_3` -> user `TEST_USER_3`

## Test Cases

### TC-01: Provisioning Validation
Precondition:
- Logged in as `SUPER_ADMIN`.

Steps:
1. Query roles, groups, users, plants from MDM APIs.
2. Verify each expected test entity exists.

Expected:
- All 3 users, 3 roles, 3 groups, and 3 plants exist.

Observed:
- PASS.

### TC-02: Group-to-Plant Assignment Validation
Precondition:
- Test entities from TC-01 exist.

Steps:
1. Verify assignment records for:
   - `TEST_GROUP_1` with plant `TEST_PLANTS_1`
   - `TEST_GROUP_2` with plant `TEST_PLANTS_1`
   - `TEST_GROUP_3` with plant `TEST_PLANTS_3`
2. Verify user override assignment for:
   - `TEST_USER_2` with plant `TEST_PLANTS_2`

Expected:
- Assignment records exist and are active.

Observed:
- PASS.

### TC-03: Module Access Contract Validation (Server-Side Login Context)
Precondition:
- Role permissions are assigned.

Steps:
1. Call `/api/master-management/mdm/users/{userId}/login-context` for each test user.
2. Inspect `rolePermissions` module codes.

Expected:
- `TEST_USER_1` -> `MOD-MDM` only.
- `TEST_USER_2` -> `MOD-IIOT` only.
- `TEST_USER_3` -> `MOD-MDM` and `MOD-IIOT`.

Observed:
- PASS.

### TC-04: Plant Scope Validation per User (Server-Side Login Context)
Precondition:
- Assignment records from TC-02 exist.

Steps:
1. Call `/api/master-management/mdm/users/{userId}/login-context`.
2. Inspect `assignedPlants`.

Expected:
- `TEST_USER_1` -> `TEST_PLANTS_1`
- `TEST_USER_2` -> `TEST_PLANTS_1`, `TEST_PLANTS_2`
- `TEST_USER_3` -> `TEST_PLANTS_3`

Observed:
- PASS.

### TC-05: UI Login Validation for Test Users
Precondition:
- Navigate to `/auth`.

Steps:
1. Enter `TEST_USER_1`, `TEST_USER_2`, `TEST_USER_3` respectively.
2. Attempt login with `Adavis@123`.

Expected:
- User should pass identity verification and be able to login.

Observed:
- FAIL for all 3 users.
- Auth API returns user not found during initiate/login phase.

Notes:
- `SUPER_ADMIN` login works.
- Test users exist in MDM and have correct login-context/permissions.
- This indicates auth-service account sync/provisioning gap outside assignment logic.

## Current Access Validation Verdict
- Assignment create/edit behavior: PASS.
- Group/user/plant mapping behavior: PASS.
- Effective module isolation (server-side context): PASS.
- End-user auth login for created test users: BLOCKED by auth-service provisioning mismatch.

## Re-run Checklist After Auth Sync Fix
1. Re-run TC-05 and verify each user can login.
2. After login:
   - `TEST_USER_1` should only see MDM module.
   - `TEST_USER_2` should only see IIOT module.
   - `TEST_USER_3` should see both MDM and IIOT modules.
3. Verify plant selector shows expected plants from TC-04.
4. Confirm forbidden module routes are not visible and not accessible.
