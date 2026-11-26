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
  AuditObservation,
  AuditReport,
  KnowledgeItem,
  ManagementActionPlan,
  ObservationStatus,
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
  sanitizeTags,
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
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'auditAreas';
  const q = query(collection(db, path), where('ownerId', '>=', ''));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: AuditArea[] = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<AuditArea, 'id'>),
        id: d.id,
      }));
      items.sort((a, b) => a.areaCode.localeCompare(b.areaCode));
      onData(items);
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
  inputs: StarterAuditAreaInput[]
): Promise<string[]> {
  const path = 'auditAreas';
  try {
    const batch = writeBatch(db);
    const createdIds: string[] = [];
    for (let i = 0; i < inputs.length; i += 1) {
      const input = inputs[i];
      const id = generateDocId('area');
      createdIds.push(id);
      const ref = doc(db, path, id);
      batch.set(ref, {
        ownerId: uid,
        areaCode: clampStr(input.areaCode, 40, `AUD-${String(i + 1).padStart(2, '0')}`),
        name: clampStr(input.name, 200, 'Untitled Audit Area'),
        domain: normalizeDomain(input.domain),
        entityName: clampStr(input.entityName, 160, 'Corporate Head Office'),
        inherentRiskTier: normalizeRiskRating(input.inherentRiskTier, 'High'),
        regulatoryContext: clampStr(input.regulatoryContext, 400, ''),
        description: clampStr(input.description, 2000, ''),
        lastAuditDate: clampStr(input.lastAuditDate, 40, 'Unscheduled'),
        hasIntelligence: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
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

export async function deleteAuditArea(areaId: string): Promise<void> {
  const path = `auditAreas/${areaId}`;
  try {
    await deleteDoc(doc(db, 'auditAreas', areaId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
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
    const cleanSections = input.includedSections.slice(0, 15).map((s) => clampStr(s, 60)).filter(Boolean);
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
