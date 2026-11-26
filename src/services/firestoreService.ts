import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  hashPassword,
  normalizeUsername,
  OperationType,
  toPublicUserProfile,
} from '../firebase';
import type {
  AuditArea,
  AuditAreaIntelligence,
  AuditAreaStatus,
  AuditDomain,
  AuditImportRecord,
  AuditImportSourceType,
  AuditLogEntry,
  AuditObservation,
  AuditReport,
  AuditUniverseLogAction,
  KnowledgeItem,
  ManagementActionPlan,
  ObservationStatus,
  ProcessDocumentation,
  RiskRating,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types/audit';
import {
  clampStr,
  normalizeDomain,
  normalizeRiskRating,
  sanitizeId,
  sanitizeIntelligence,
  sanitizeKnowledgeType,
  sanitizeManagementActionPlan,
  sanitizeObservationStatus,
  sanitizeProcessDocumentationInput,
  sanitizeTags,
  type ProcessDocumentationInput,
} from '../utils/validation';
import type { StarterAuditAreaInput, StarterKnowledgeInput } from '../data/starterUniverse';

function generateDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return sanitizeId(`${prefix}_${ts}_${rand}`);
}

export function subscribeCurrentUserProfile(
  userId: string,
  onData: (profile: UserProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}`;
  return onSnapshot(
    doc(db, 'users', userId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      if (typeof data.userId !== 'string' || typeof data.passwordHash !== 'string') {
        onData(null);
        return;
      }
      onData(toPublicUserProfile(data));
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeAllUsers(
  onData: (users: UserProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'users';
  const q = query(collection(db, path), where('username', '>=', ''));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: UserProfile[] = snapshot.docs
        .map((d) => d.data() as Record<string, unknown>)
        .filter((d) => typeof d.userId === 'string' && typeof d.passwordHash === 'string')
        .map((d) => toPublicUserProfile(d));
      items.sort((a, b) => a.fullName.localeCompare(b.fullName));
      onData(items);
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createAppUserAsAdmin(params: {
  fullName: string;
  username: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword?: boolean;
}): Promise<string> {
  const cleanUsername = normalizeUsername(params.username);
  const cleanFullName = clampStr(params.fullName, 120, '');
  if (!cleanFullName || cleanUsername.length < 2 || params.password.length < 6) {
    throw new Error('Full Name, Username (min. 2 characters), and Password (min. 6 characters) are required.');
  }

  const existing = await getDocs(
    query(collection(db, 'users'), where('username', '==', cleanUsername), limit(5))
  );
  const duplicate = existing.docs.find((d) => {
    const raw = d.data() as Record<string, unknown>;
    return typeof raw.userId === 'string' && typeof raw.passwordHash === 'string';
  });
  if (duplicate) {
    throw new Error(`Username "${cleanUsername}" is already assigned to another user.`);
  }

  const userId = generateDocId('usr');
  const path = `users/${userId}`;
  try {
    const passwordHash = await hashPassword(params.password);
    await setDoc(doc(db, 'users', userId), {
      userId,
      username: cleanUsername.slice(0, 60),
      passwordHash,
      fullName: cleanFullName,
      role: params.role,
      status: params.status,
      mustChangePassword: Boolean(params.mustChangePassword),
      createdDate: serverTimestamp(),
      lastLogin: null,
    });
    return userId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAppUserProfile(params: {
  userId: string;
  previousUsername: string;
  fullName: string;
  username: string;
  role: UserRole;
  status: UserStatus;
}): Promise<void> {
  const path = `users/${params.userId}`;
  const cleanUsername = normalizeUsername(params.username);
  const cleanFullName = clampStr(params.fullName, 120, '');
  if (!cleanFullName || cleanUsername.length < 2) {
    throw new Error('Full Name and Username (min. 2 valid characters) are required.');
  }

  if (cleanUsername !== params.previousUsername) {
    const existing = await getDocs(
      query(collection(db, 'users'), where('username', '==', cleanUsername), limit(5))
    );
    const takenByOther = existing.docs.find((d) => {
      const raw = d.data() as Record<string, unknown>;
      return typeof raw.userId === 'string' && raw.userId !== params.userId && typeof raw.passwordHash === 'string';
    });
    if (takenByOther) {
      throw new Error(`Username "${cleanUsername}" is already assigned to another user.`);
    }
  }

  try {
    await updateDoc(doc(db, 'users', params.userId), {
      fullName: cleanFullName,
      username: cleanUsername.slice(0, 60),
      role: params.role,
      status: params.status,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleAppUserStatus(userId: string, nextStatus: UserStatus): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      status: nextStatus,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function resetAppUserPassword(params: {
  userId: string;
  newPassword: string;
  mustChangePassword?: boolean;
}): Promise<void> {
  if (params.newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }
  const path = `users/${params.userId}`;
  try {
    const passwordHash = await hashPassword(params.newPassword);
    await updateDoc(doc(db, 'users', params.userId), {
      passwordHash,
      mustChangePassword: params.mustChangePassword ?? true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeAuditAreas(
  onData: (areas: AuditArea[]) => void,
  onError?: (err: Error) => void,
  onSyncMeta?: (meta: SnapshotSyncMeta) => void
): Unsubscribe {
  const path = 'auditAreas';
  const q = query(collection(db, path), where('ownerId', '>=', ''));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const items: AuditArea[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<AuditArea, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => a.areaCode.localeCompare(b.areaCode));
      onData(items);
      if (onSyncMeta) {
        onSyncMeta({
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          syncedAt: new Date(),
        });
      }
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeObservations(
  onData: (obs: AuditObservation[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'auditObservations';
  const q = query(collection(db, path), where('ownerId', '>=', ''));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AuditObservation[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<AuditObservation, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return tb - ta;
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeKnowledgeItems(
  onData: (items: KnowledgeItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'knowledgeItems';
  const q = query(collection(db, path), where('ownerId', '>=', ''));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: KnowledgeItem[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<KnowledgeItem, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return tb - ta;
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAuditReports(
  onData: (reports: AuditReport[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'auditReports';
  const q = query(collection(db, path), where('ownerId', '>=', ''));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AuditReport[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<AuditReport, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const ta = (a.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const tb = (b.updatedAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return tb - ta;
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createAuditAreasBatch(
  uid: string,
  inputs: StarterAuditAreaInput[],
  datasetId = ''
): Promise<string[]> {
  const path = 'auditAreas';
  try {
    const cleanDatasetId = datasetId ? sanitizeId(datasetId) : '';
    const createdIds: string[] = [];
    const chunkSize = 400;
    for (let offset = 0; offset < inputs.length; offset += chunkSize) {
      const batch = writeBatch(db);
      const slice = inputs.slice(offset, offset + chunkSize);
      for (let i = 0; i < slice.length; i += 1) {
        const input = slice[i];
        const id = generateDocId('area');
        createdIds.push(id);
        const ref = doc(db, path, id);
        batch.set(ref, {
          ownerId: uid,
          areaCode: clampStr(input.areaCode, 40, `AUD-${String(offset + i + 1).padStart(2, '0')}`),
          name: clampStr(input.name, 200, 'Untitled Audit Area'),
          domain: normalizeDomain(input.domain),
          entityName: clampStr(input.entityName, 160, 'Corporate Head Office'),
          inherentRiskTier: normalizeRiskRating(input.inherentRiskTier, 'High'),
          regulatoryContext: clampStr(input.regulatoryContext, 400, ''),
          description: clampStr(input.description, 2000, ''),
          lastAuditDate: clampStr(input.lastAuditDate, 40, 'Unscheduled'),
          hasIntelligence: false,
          status: 'Active',
          datasetId: cleanDatasetId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return createdIds;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveAuditAreaIntelligence(
  areaId: string,
  intelligence: AuditAreaIntelligence,
  updateRiskTier?: RiskRating
): Promise<void> {
  const path = `auditAreas/${areaId}`;
  try {
    const cleanIntel = sanitizeIntelligence(intelligence);
    const ref = doc(db, 'auditAreas', areaId);
    const payload: Record<string, unknown> = {
      hasIntelligence: true,
      intelligence: cleanIntel,
      updatedAt: serverTimestamp(),
    };
    if (updateRiskTier) {
      payload.inherentRiskTier = normalizeRiskRating(updateRiskTier, cleanIntel.riskRating);
    }
    await updateDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface UpdateAuditAreaMetadataInput {
  areaCode: string;
  name: string;
  domain: AuditDomain;
  entityName: string;
  inherentRiskTier: RiskRating;
  regulatoryContext: string;
  description: string;
  lastAuditDate: string;
}

export async function updateAuditAreaMetadata(
  areaId: string,
  updates: UpdateAuditAreaMetadataInput
): Promise<void> {
  const path = `auditAreas/${areaId}`;
  try {
    await updateDoc(doc(db, 'auditAreas', areaId), {
      areaCode: clampStr(updates.areaCode, 40, 'AUD-01'),
      name: clampStr(updates.name, 200, 'Untitled Audit Area'),
      domain: normalizeDomain(updates.domain),
      entityName: clampStr(updates.entityName, 160, 'Corporate Head Office'),
      inherentRiskTier: normalizeRiskRating(updates.inherentRiskTier, 'High'),
      regulatoryContext: clampStr(updates.regulatoryContext, 400, ''),
      description: clampStr(updates.description, 2000, ''),
      lastAuditDate: clampStr(updates.lastAuditDate, 40, 'Unscheduled'),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function duplicateAuditArea(
  uid: string,
  source: AuditArea,
  existingCodes: string[] = []
): Promise<{ id: string; areaCode: string; name: string }> {
  const id = generateDocId('area');
  const path = `auditAreas/${id}`;
  try {
    const codeSet = new Set(existingCodes.map((c) => c.trim().toUpperCase()));
    const baseCode = clampStr(source.areaCode, 30, 'AUD');
    let nextCode = `${baseCode}-COPY`.slice(0, 40);
    let suffix = 2;
    while (codeSet.has(nextCode.toUpperCase())) {
      nextCode = `${baseCode}-COPY${suffix}`.slice(0, 40);
      suffix += 1;
    }
    const nextName = clampStr(`${source.name} (Copy)`, 200, 'Duplicated Audit Area');

    const payload: Record<string, unknown> = {
      ownerId: uid,
      areaCode: nextCode,
      name: nextName,
      domain: normalizeDomain(source.domain),
      entityName: clampStr(source.entityName, 160, 'Corporate Head Office'),
      inherentRiskTier: normalizeRiskRating(source.inherentRiskTier, 'High'),
      regulatoryContext: clampStr(source.regulatoryContext, 400, ''),
      description: clampStr(source.description, 2000, ''),
      lastAuditDate: clampStr(source.lastAuditDate, 40, 'Unscheduled'),
      hasIntelligence: Boolean(source.hasIntelligence && source.intelligence),
      status: 'Active',
      datasetId: source.datasetId ? sanitizeId(source.datasetId) : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (source.hasIntelligence && source.intelligence) {
      payload.intelligence = sanitizeIntelligence(source.intelligence);
    }

    await setDoc(doc(db, 'auditAreas', id), payload);
    return { id, areaCode: nextCode, name: nextName };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function setAuditAreaStatus(
  areaId: string,
  status: AuditAreaStatus
): Promise<void> {
  const path = `auditAreas/${areaId}`;
  try {
    await updateDoc(doc(db, 'auditAreas', areaId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function bulkSetAuditAreaStatus(
  areaIds: string[],
  status: AuditAreaStatus
): Promise<void> {
  if (areaIds.length === 0) return;
  const path = 'auditAreas';
  try {
    const chunkSize = 400;
    for (let offset = 0; offset < areaIds.length; offset += chunkSize) {
      const batch = writeBatch(db);
      const slice = areaIds.slice(offset, offset + chunkSize);
      for (const areaId of slice) {
        batch.update(doc(db, 'auditAreas', areaId), {
          status,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function bulkDeleteAuditAreasCascade(areaIds: string[]): Promise<void> {
  if (areaIds.length === 0) return;
  const path = `auditAreas/${areaIds[0]}`;
  try {
    const targetIds = new Set(areaIds.map((id) => sanitizeId(id)).filter(Boolean));
    if (targetIds.size === 0) return;

    const [procSnap, obsSnap, repSnap, kbSnap] = await Promise.all([
      getDocs(query(collection(db, 'processDocumentations'), where('ownerId', '>=', ''))),
      getDocs(query(collection(db, 'auditObservations'), where('ownerId', '>=', ''))),
      getDocs(query(collection(db, 'auditReports'), where('ownerId', '>=', ''))),
      getDocs(query(collection(db, 'knowledgeItems'), where('ownerId', '>=', ''))),
    ]);

    const refsToDelete = [
      ...procSnap.docs
        .filter((d) => targetIds.has(String(d.data().linkedAreaId || '')))
        .map((d) => d.ref),
      ...obsSnap.docs
        .filter((d) => targetIds.has(String(d.data().areaId || '')))
        .map((d) => d.ref),
      ...repSnap.docs
        .filter((d) => targetIds.has(String(d.data().areaId || '')))
        .map((d) => d.ref),
      ...kbSnap.docs
        .filter((d) => targetIds.has(String(d.data().sourceAreaId || '')))
        .map((d) => d.ref),
      ...Array.from(targetIds).map((id) => doc(db, 'auditAreas', id)),
    ];

    const chunkSize = 400;
    for (let offset = 0; offset < refsToDelete.length; offset += chunkSize) {
      const batch = writeBatch(db);
      for (const ref of refsToDelete.slice(offset, offset + chunkSize)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteAuditAreaCascade(areaId: string): Promise<void> {
  return bulkDeleteAuditAreasCascade([areaId]);
}

export async function deleteAuditArea(areaId: string): Promise<void> {
  return bulkDeleteAuditAreasCascade([areaId]);
}

export interface CreateObservationInput {
  areaId: string;
  areaName: string;
  domain: string;
  observationTitle: string;
  observationText: string;
  evidenceRef: string;
  sampleTested: string;
  auditFinding: string;
  riskStatement: string;
  rootCause: string;
  recommendation: string;
  riskRating: RiskRating;
  managementActionPlan: ManagementActionPlan;
  status?: ObservationStatus;
}

export async function createAuditObservation(
  uid: string,
  input: CreateObservationInput
): Promise<string> {
  const id = generateDocId('obs');
  const path = `auditObservations/${id}`;
  try {
    await setDoc(doc(db, 'auditObservations', id), {
      ownerId: uid,
      areaId: input.areaId ? sanitizeId(input.areaId) : '',
      areaName: clampStr(input.areaName, 200, 'General Audit Area'),
      domain: normalizeDomain(input.domain),
      observationTitle: clampStr(input.observationTitle, 200, 'Field Observation'),
      observationText: clampStr(input.observationText, 5000, 'Observation recorded.'),
      evidenceRef: clampStr(input.evidenceRef, 500, ''),
      sampleTested: clampStr(input.sampleTested, 300, ''),
      auditFinding: clampStr(input.auditFinding, 4000, ''),
      riskStatement: clampStr(input.riskStatement, 3000, ''),
      rootCause: clampStr(input.rootCause, 3000, ''),
      recommendation: clampStr(input.recommendation, 3000, ''),
      riskRating: normalizeRiskRating(input.riskRating, 'High'),
      managementActionPlan: sanitizeManagementActionPlan(input.managementActionPlan),
      status: sanitizeObservationStatus(input.status || 'Validated'),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAuditObservation(
  obsId: string,
  updates: Partial<{
    observationTitle: string;
    observationText: string;
    evidenceRef: string;
    sampleTested: string;
    auditFinding: string;
    riskStatement: string;
    rootCause: string;
    recommendation: string;
    riskRating: RiskRating;
    managementActionPlan: ManagementActionPlan;
    status: ObservationStatus;
  }>
): Promise<void> {
  const path = `auditObservations/${obsId}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.observationTitle !== undefined) payload.observationTitle = clampStr(updates.observationTitle, 200, 'Field Observation');
    if (updates.observationText !== undefined) payload.observationText = clampStr(updates.observationText, 5000, 'Observation');
    if (updates.evidenceRef !== undefined) payload.evidenceRef = clampStr(updates.evidenceRef, 500, '');
    if (updates.sampleTested !== undefined) payload.sampleTested = clampStr(updates.sampleTested, 300, '');
    if (updates.auditFinding !== undefined) payload.auditFinding = clampStr(updates.auditFinding, 4000, '');
    if (updates.riskStatement !== undefined) payload.riskStatement = clampStr(updates.riskStatement, 3000, '');
    if (updates.rootCause !== undefined) payload.rootCause = clampStr(updates.rootCause, 3000, '');
    if (updates.recommendation !== undefined) payload.recommendation = clampStr(updates.recommendation, 3000, '');
    if (updates.riskRating !== undefined) payload.riskRating = normalizeRiskRating(updates.riskRating, 'High');
    if (updates.managementActionPlan !== undefined) {
      payload.managementActionPlan = sanitizeManagementActionPlan(updates.managementActionPlan);
    }
    if (updates.status !== undefined) payload.status = sanitizeObservationStatus(updates.status);

    await updateDoc(doc(db, 'auditObservations', obsId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAuditObservation(obsId: string): Promise<void> {
  const path = `auditObservations/${obsId}`;
  try {
    await deleteDoc(doc(db, 'auditObservations', obsId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createKnowledgeItem(
  uid: string,
  input: StarterKnowledgeInput & { sourceAreaId?: string }
): Promise<string> {
  const id = generateDocId('kb');
  const path = `knowledgeItems/${id}`;
  try {
    const validRatings = ['Critical', 'High', 'Moderate', 'Low', 'Informational'];
    const rating = validRatings.includes(input.riskRating) ? input.riskRating : 'Informational';
    await setDoc(doc(db, 'knowledgeItems', id), {
      ownerId: uid,
      type: sanitizeKnowledgeType(input.type),
      domain: normalizeDomain(input.domain),
      title: clampStr(input.title, 240, 'Audit Knowledge Entry'),
      content: clampStr(input.content, 8000, 'Details'),
      riskRating: rating,
      regulatoryRef: clampStr(input.regulatoryRef, 300, ''),
      tags: sanitizeTags(input.tags),
      sourceAreaId: input.sourceAreaId ? sanitizeId(input.sourceAreaId) : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createKnowledgeItemsBatch(
  uid: string,
  inputs: StarterKnowledgeInput[]
): Promise<void> {
  const path = 'knowledgeItems';
  try {
    const batch = writeBatch(db);
    for (const input of inputs) {
      const id = generateDocId('kb');
      batch.set(doc(db, path, id), {
        ownerId: uid,
        type: sanitizeKnowledgeType(input.type),
        domain: normalizeDomain(input.domain),
        title: clampStr(input.title, 240, 'Audit Knowledge Entry'),
        content: clampStr(input.content, 8000, 'Details'),
        riskRating: input.riskRating,
        regulatoryRef: clampStr(input.regulatoryRef, 300, ''),
        tags: sanitizeTags(input.tags),
        sourceAreaId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteKnowledgeItem(itemId: string): Promise<void> {
  const path = `knowledgeItems/${itemId}`;
  try {
    await deleteDoc(doc(db, 'knowledgeItems', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveAuditReport(
  uid: string,
  input: {
    reportId?: string;
    areaId: string;
    title: string;
    entityName: string;
    reportPeriod: string;
    executiveSummary: string;
    scopeAndMethodology: string;
    overallConclusion: string;
    includedSections: string[];
    includedObservationIds: string[];
    status: 'Draft' | 'Finalized';
  }
): Promise<string> {
  const id = input.reportId ? sanitizeId(input.reportId) : generateDocId('rep');
  const path = `auditReports/${id}`;
  try {
    const cleanSections = input.includedSections.slice(0, 30).map((s) => clampStr(s, 60)).filter(Boolean);
    const cleanObsIds = input.includedObservationIds.slice(0, 50).map((s) => sanitizeId(s)).filter(Boolean);
    const payload = {
      title: clampStr(input.title, 240, 'Internal Audit Report'),
      entityName: clampStr(input.entityName, 160, 'Corporate Entity'),
      reportPeriod: clampStr(input.reportPeriod, 100, 'FY 2026'),
      executiveSummary: clampStr(input.executiveSummary, 8000, ''),
      scopeAndMethodology: clampStr(input.scopeAndMethodology, 5000, ''),
      overallConclusion: clampStr(input.overallConclusion, 5000, ''),
      includedSections: cleanSections,
      includedObservationIds: cleanObsIds,
      status: input.status === 'Finalized' ? 'Finalized' : 'Draft',
      updatedAt: serverTimestamp(),
    };

    if (input.reportId) {
      await updateDoc(doc(db, 'auditReports', id), payload);
    } else {
      await setDoc(doc(db, 'auditReports', id), {
        ownerId: uid,
        areaId: sanitizeId(input.areaId),
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface SnapshotSyncMeta {
  fromCache: boolean;
  hasPendingWrites: boolean;
  syncedAt: Date;
}

export function subscribeProcessDocumentations(
  onData: (docs: ProcessDocumentation[], meta: SnapshotSyncMeta) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'processDocumentations';
  const q = query(collection(db, path), where('ownerId', '>=', ''));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const items: ProcessDocumentation[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<ProcessDocumentation, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => a.processCode.localeCompare(b.processCode));
      onData(items, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        syncedAt: new Date(),
      });
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createProcessDocumentation(
  uid: string,
  input: Partial<ProcessDocumentationInput>
): Promise<string> {
  const id = generateDocId('proc');
  const path = `processDocumentations/${id}`;
  try {
    const clean = sanitizeProcessDocumentationInput(input);
    await setDoc(doc(db, 'processDocumentations', id), {
      ownerId: uid,
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateProcessDocumentation(
  processId: string,
  input: Partial<ProcessDocumentationInput>
): Promise<void> {
  const path = `processDocumentations/${processId}`;
  try {
    const clean = sanitizeProcessDocumentationInput(input);
    await updateDoc(doc(db, 'processDocumentations', processId), {
      ...clean,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProcessDocumentation(processId: string): Promise<void> {
  const path = `processDocumentations/${processId}`;
  try {
    await deleteDoc(doc(db, 'processDocumentations', processId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// -----------------------------------------------------------------------------
// Audit Universe Import History & Activity Audit Logs
// -----------------------------------------------------------------------------

export function subscribeAuditImportHistory(
  onData: (records: AuditImportRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'auditImportHistory';
  const q = query(collection(db, path), where('ownerId', '>=', ''));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AuditImportRecord[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<AuditImportRecord, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return tb - ta;
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createAuditImportRecord(params: {
  id?: string;
  ownerId: string;
  datasetName: string;
  uploadedByUserId: string;
  uploadedByName: string;
  uploadedByUsername: string;
  sourceType: AuditImportSourceType;
  records: StarterAuditAreaInput[];
  createdAreaIds: string[];
}): Promise<string> {
  const id = params.id ? sanitizeId(params.id) : generateDocId('imp');
  const path = `auditImportHistory/${id}`;
  try {
    const cleanUsername = normalizeUsername(params.uploadedByUsername).slice(0, 60) || 'user';
    const cleanRecords = params.records.slice(0, 60).map((r, idx) => ({
      areaCode: clampStr(r.areaCode, 40, `AUD-${String(idx + 1).padStart(2, '0')}`),
      name: clampStr(r.name, 200, 'Untitled Audit Area'),
      domain: normalizeDomain(r.domain),
      entityName: clampStr(r.entityName, 160, 'Corporate Head Office'),
      inherentRiskTier: normalizeRiskRating(r.inherentRiskTier, 'High'),
      regulatoryContext: clampStr(r.regulatoryContext, 400, ''),
      description: clampStr(r.description, 2000, ''),
      lastAuditDate: clampStr(r.lastAuditDate, 40, 'Unscheduled'),
    }));
    const cleanAreaIds = params.createdAreaIds
      .slice(0, 60)
      .map((aid) => sanitizeId(aid))
      .filter(Boolean);

    await setDoc(doc(db, 'auditImportHistory', id), {
      ownerId: sanitizeId(params.ownerId) || 'system',
      datasetName: clampStr(params.datasetName, 200, 'Audit Universe Import'),
      uploadedByUserId: sanitizeId(params.uploadedByUserId) || 'system',
      uploadedByName: clampStr(params.uploadedByName, 120, 'Administrator'),
      uploadedByUsername: cleanUsername.length >= 2 ? cleanUsername : 'admin',
      recordCount: Math.min(100, cleanRecords.length),
      sourceType: params.sourceType,
      status: 'Active',
      records: cleanRecords,
      createdAreaIds: cleanAreaIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAuditImportStatus(
  importId: string,
  status: 'Active' | 'Archived'
): Promise<void> {
  const path = `auditImportHistory/${importId}`;
  try {
    await updateDoc(doc(db, 'auditImportHistory', importId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAuditImportRecord(importId: string): Promise<void> {
  const path = `auditImportHistory/${importId}`;
  try {
    await deleteDoc(doc(db, 'auditImportHistory', importId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeAuditLogs(
  onData: (logs: AuditLogEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'auditLogs';
  const q = query(collection(db, path), where('userId', '>=', ''));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AuditLogEntry[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<AuditLogEntry, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => {
        const ta = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const tb = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return tb - ta;
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createAuditLogEntry(params: {
  userId: string;
  userName: string;
  username: string;
  action: AuditUniverseLogAction;
  areaId?: string;
  areaCode: string;
  areaName: string;
  details?: string;
}): Promise<string> {
  const id = generateDocId('log');
  const path = `auditLogs/${id}`;
  try {
    const now = new Date();
    const eventDate = now.toISOString().slice(0, 10);
    const eventTime = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const cleanUsername = normalizeUsername(params.username).slice(0, 60) || 'user';
    await setDoc(doc(db, 'auditLogs', id), {
      userId: sanitizeId(params.userId) || 'system',
      userName: clampStr(params.userName, 120, 'Administrator'),
      username: cleanUsername.length >= 2 ? cleanUsername : 'admin',
      action: params.action,
      areaId: params.areaId ? sanitizeId(params.areaId) : '',
      areaCode: clampStr(params.areaCode, 80, ''),
      areaName: clampStr(params.areaName, 240, 'Audit Universe'),
      details: clampStr(params.details || '', 1000, ''),
      eventDate,
      eventTime,
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}


