import bcrypt from 'bcryptjs';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { UserProfile, UserRole, UserStatus } from './types/audit';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();

const BCRYPT_ROUNDS = 10;
const DEFAULT_ADMIN_USER_ID = 'user_admin';
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_INITIAL_SECRET = 'Admin@2026';

let activeActorUserId: string | null = null;
export function setActiveActorUserId(userId: string | null): void {
  activeActorUserId = userId;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  actorUserId: string | null;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    actorUserId: activeActorUserId,
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

interface StoredUserDoc {
  userId: string;
  username: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword?: boolean;
  createdDate?: unknown;
  lastLogin?: unknown;
}

export function toPublicUserProfile(data: Partial<StoredUserDoc>): UserProfile {
  return {
    userId: String(data.userId || ''),
    username: String(data.username || ''),
    fullName: String(data.fullName || ''),
    role: (data.role as UserRole) || 'Viewer',
    status: (data.status as UserStatus) || 'Active',
    mustChangePassword: Boolean(data.mustChangePassword),
    createdDate: data.createdDate ?? null,
    lastLogin: data.lastLogin ?? null,
  };
}

let seedPromise: Promise<void> | null = null;

export async function ensureDefaultAdminSeeded(): Promise<void> {
  if (seedPromise) {
    return seedPromise;
  }

  seedPromise = (async () => {
    try {
      const seedRef = doc(db, 'systemConfig', 'customAuthSeed');
      const seedSnap = await getDoc(seedRef);
      if (seedSnap.exists()) {
        return;
      }

      const existingAdminSnap = await getDoc(doc(db, 'users', DEFAULT_ADMIN_USER_ID));
      const existingQuery = await getDocs(
        query(collection(db, 'users'), where('username', '==', DEFAULT_ADMIN_USERNAME), limit(5))
      );
      const existingCustomAdmin = existingQuery.docs.find((d) => {
        const raw = d.data() as Partial<StoredUserDoc>;
        return typeof raw.userId === 'string' && typeof raw.passwordHash === 'string';
      });

      const batch = writeBatch(db);
      if (existingAdminSnap.exists() && typeof existingAdminSnap.data().passwordHash === 'string') {
        batch.set(seedRef, {
          seeded: true,
          adminUserId: DEFAULT_ADMIN_USER_ID,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        return;
      }

      if (existingCustomAdmin) {
        const data = existingCustomAdmin.data() as Partial<StoredUserDoc>;
        batch.set(seedRef, {
          seeded: true,
          adminUserId: String(data.userId || existingCustomAdmin.id),
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        return;
      }

      const passwordHash = await hashPassword(DEFAULT_ADMIN_INITIAL_SECRET);
      batch.set(seedRef, {
        seeded: true,
        adminUserId: DEFAULT_ADMIN_USER_ID,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', DEFAULT_ADMIN_USER_ID), {
        userId: DEFAULT_ADMIN_USER_ID,
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash,
        fullName: 'System Administrator',
        role: 'Administrator',
        status: 'Active',
        mustChangePassword: true,
        createdDate: serverTimestamp(),
        lastLogin: null,
      });
      await batch.commit();
    } catch (err) {
      seedPromise = null;
      throw err;
    }
  })();

  return seedPromise;
}

export async function loginWithUsernameAndPassword(
  usernameInput: string,
  passwordInput: string
): Promise<UserProfile> {
  const cleanUsername = normalizeUsername(usernameInput);
  if (!cleanUsername || !passwordInput) {
    throw new Error('Please enter your username and password.');
  }

  await ensureDefaultAdminSeeded();

  const snap = await getDocs(
    query(collection(db, 'users'), where('username', '==', cleanUsername), limit(5))
  );

  const matchedDoc = snap.docs
    .map((d) => d.data() as Partial<StoredUserDoc>)
    .find((d) => typeof d.userId === 'string' && typeof d.passwordHash === 'string');

  if (!matchedDoc || !matchedDoc.passwordHash || !matchedDoc.userId) {
    throw new Error('Invalid username or password.');
  }

  const passwordValid = await verifyPassword(passwordInput, matchedDoc.passwordHash);
  if (!passwordValid) {
    throw new Error('Invalid username or password.');
  }

  if (matchedDoc.status === 'Disabled') {
    throw new Error('Account Disabled. Please contact your Administrator.');
  }

  await updateDoc(doc(db, 'users', matchedDoc.userId), {
    lastLogin: serverTimestamp(),
  });

  const profile = toPublicUserProfile({
    ...matchedDoc,
    lastLogin: new Date().toISOString(),
  });
  setActiveActorUserId(profile.userId);
  return profile;
}

export async function completeFirstLoginPasswordChange(params: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  if (params.newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters.');
  }
  if (params.newPassword === params.currentPassword) {
    throw new Error('New password must be different from your current password.');
  }

  const userRef = doc(db, 'users', params.userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    throw new Error('User account not found.');
  }

  const data = snap.data() as Partial<StoredUserDoc>;
  if (!data.passwordHash) {
    throw new Error('Account password record is invalid.');
  }

  const matches = await verifyPassword(params.currentPassword, data.passwordHash);
  if (!matches) {
    throw new Error('Current password is incorrect.');
  }

  const newHash = await hashPassword(params.newPassword);
  await updateDoc(userRef, {
    passwordHash: newHash,
    mustChangePassword: false,
  });
}
