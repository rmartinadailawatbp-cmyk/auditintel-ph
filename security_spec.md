# Firestore Security Specification & RBAC Invariants

## 1. Role-Based Access Control (RBAC) Invariants
1. **Authentication Mode**: Firebase Email/Password authentication only (`signInWithEmailAndPassword` / `createUserWithEmailAndPassword`). No Google OAuth or external social providers.
2. **First Registered User**: The first registered account claims `/systemConfig/bootstrap` (which is immutable once created) and automatically receives `role: 'Administrator'` and `status: 'Active'`. Subsequent accounts cannot self-assign `Administrator` and can only be provisioned by an active `Administrator`.
3. **Active Status Enforcement**: Disabled accounts (`status == 'Disabled'`) are blocked at the security-rules layer (`isActiveUser()`) across all collections (`auditAreas`, `auditObservations`, `knowledgeItems`, `auditReports`).
4. **Role Matrix**:
   - **Administrator**: Full read/write/delete access across `users`, `usernameIndex`, `auditAreas`, `auditObservations`, `knowledgeItems`, and `auditReports` (including existing uploaded data).
   - **Auditor**: Read/create/update access on `auditAreas`, `auditObservations`, `knowledgeItems`, and `auditReports`; read own profile on `users`; cannot create/modify/disable other users.
   - **Viewer**: Strictly read-only (`get`, `list`) on `auditAreas`, `auditObservations`, `knowledgeItems`, `auditReports`, and own `users/{uid}`; all writes denied.
5. **PII & Credential Isolation**: `/users` `list` is restricted strictly to active `Administrator` users; non-admins can only `get` their own `/users/{request.auth.uid}` document. `/usernameIndex` forbids `list` queries so usernames/emails cannot be scraped.
6. **Temporal & Data Structure Integrity**: Existing collections (`auditAreas`, `auditObservations`, `knowledgeItems`, `auditReports`) retain their `ownerId` structure so previously uploaded audit universes and generated content remain accessible; `ownerId` must equal `request.auth.uid` on create and remain immutable on update; `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
7. **Terminal State Locking**: Once an `auditObservations` record is `Closed` or an `auditReports` record is `Finalized`, updates by Auditors are blocked (Administrators retain override capability for governance corrections).
