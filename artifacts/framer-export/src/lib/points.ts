import { ref, get, set, update, onValue } from "firebase/database";
import { db } from "./firebase";

export const POINTS = {
  ACCOUNT_CREATION: 5,
  IMPORT_FRAMER: -4,
  PUSH_GITHUB: -1,
  UNLOCK_TEMPLATE: -10,
  MIN_EDIT_BALANCE: 2,
} as const;

export async function initPoints(uid: string): Promise<void> {
  const pointsRef = ref(db, `users/${uid}/points`);
  const snap = await get(pointsRef);
  if (!snap.exists()) {
    await set(pointsRef, POINTS.ACCOUNT_CREATION);
  }
}

export async function getPoints(uid: string): Promise<number> {
  const snap = await get(ref(db, `users/${uid}/points`));
  return snap.exists() ? (snap.val() as number) : 0;
}

export async function adjustPoints(uid: string, delta: number): Promise<number> {
  const current = await getPoints(uid);
  const next = current + delta;
  await set(ref(db, `users/${uid}/points`), next);
  return next;
}

export async function canAfford(uid: string, cost: number): Promise<boolean> {
  const pts = await getPoints(uid);
  return pts >= Math.abs(cost);
}

export function watchPoints(uid: string, cb: (pts: number) => void) {
  const pointsRef = ref(db, `users/${uid}/points`);
  return onValue(pointsRef, (snap) => {
    cb(snap.exists() ? (snap.val() as number) : 0);
  });
}

// GitHub credentials
export async function saveGithubCredentials(
  uid: string,
  username: string,
  pat: string
): Promise<void> {
  await update(ref(db, `users/${uid}/github`), { username, pat });
}

export async function getGithubCredentials(
  uid: string
): Promise<{ username: string; pat: string } | null> {
  const snap = await get(ref(db, `users/${uid}/github`));
  return snap.exists() ? snap.val() : null;
}

// Project storage
export async function saveProject(
  uid: string,
  projectId: string,
  data: {
    name: string;
    html: string;
    url?: string;
    repoName?: string;
    createdAt: number;
  }
): Promise<void> {
  await set(ref(db, `projects/${uid}/${projectId}`), data);
}

export async function getProjects(uid: string): Promise<Record<string, unknown>> {
  const snap = await get(ref(db, `projects/${uid}`));
  return snap.exists() ? snap.val() : {};
}
