import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import axios from "axios";

export type FileCategory = "html" | "css" | "js" | "image" | "video" | "font" | "json" | "other";
export interface ConversionFile {
  path: string; originalUrl: string; size: number; mimeType: string;
  category: FileCategory; blobUrl: string;
}
export type JobStatus = "pending" | "crawling" | "downloading" | "processing" | "done" | "error";
export interface ConversionJob {
  id: string; url: string; status: JobStatus; progress: number; message: string;
  totalFiles: number; totalSizeBytes: number; files: ConversionFile[];
  previewPath: string | null; downloadPath: string | null;
  createdAt: string; completedAt: string | null; errorMessage: string | null;
  expiresAt: number; requestsUsed: number; maxRequests: number;
}
type StoredJob = Omit<ConversionJob, "files" | "totalFiles" | "totalSizeBytes"> & {
  files?: Record<string, ConversionFile>;
  totalFiles?: number; totalSizeBytes?: number;
};
const DB_URL = (process.env.FIREBASE_DATABASE_URL || "https://breachr-f1e71-default-rtdb.firebaseio.com").replace(/\/$/, "");
const DB_TOKEN = process.env.FIREBASE_DATABASE_SECRET || process.env.FIREBASE_DATABASE_AUTH_TOKEN;
const TTL_MS = 10 * 60 * 1000;

function dbUrl(path: string): string {
  const suffix = path ? `/${path}` : "";
  return `${DB_URL}/framerjobs${suffix}.json${DB_TOKEN ? `?auth=${encodeURIComponent(DB_TOKEN)}` : ""}`;
}
async function dbRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  try {
    const response = await axios.request({
      url: dbUrl(path),
      method,
      data: body,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      timeout: 15000,
    });
    return response.data as T;
  } catch (error) {
    const detail = axios.isAxiosError(error)
      ? `${error.response?.status || error.code}: ${JSON.stringify(error.response?.data || error.message).slice(0, 300)}`
      : String(error);
    throw new Error(`Firebase RTDB ${method} failed: ${detail}`);
  }
}
function fileKey(filePath: string): string {
  return Buffer.from(filePath, "utf8").toString("base64url");
}
function hydrate(raw: StoredJob): ConversionJob {
  const files = Object.values(raw.files || {});
  return {
    ...raw, files,
    totalFiles: files.length,
    totalSizeBytes: files.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
  };
}
export async function createJob(url: string): Promise<ConversionJob> {
  await listJobs(); // opportunistically remove expired records and their Blob assets
  const now = Date.now();
  const id = randomUUID();
  const job: ConversionJob = {
    id, url, status: "pending", progress: 0, message: "Starting conversion…",
    totalFiles: 0, totalSizeBytes: 0, files: [], previewPath: null, downloadPath: null,
    createdAt: new Date(now).toISOString(), completedAt: null, errorMessage: null,
    expiresAt: now + TTL_MS, requestsUsed: 0, maxRequests: 5,
  };
  const { files: _files, ...record } = job;
  await dbRequest(id, "PUT", record);
  return job;
}
async function removeExpired(id: string, raw: StoredJob): Promise<void> {
  const files = Object.values(raw.files || {});
  await Promise.allSettled(files.map((file) => file.blobUrl ? del(file.blobUrl) : Promise.resolve()));
  await dbRequest(id, "DELETE");
}
export async function getJob(id: string): Promise<ConversionJob | undefined> {
  const raw = await dbRequest<StoredJob | null>(id, "GET");
  if (!raw) return undefined;
  if (Number(raw.expiresAt) <= Date.now()) {
    await removeExpired(id, raw);
    return undefined;
  }
  return hydrate(raw);
}
export async function listJobs(): Promise<ConversionJob[]> {
  const raw = await dbRequest<Record<string, StoredJob> | null>("", "GET");
  if (!raw) return [];
  const entries = await Promise.all(Object.entries(raw).map(async ([id, record]) => {
    if (Number(record.expiresAt) <= Date.now()) {
      await removeExpired(id, record);
      return null;
    }
    return hydrate(record);
  }));
  return entries.filter((job): job is ConversionJob => job !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export async function updateJob(id: string, updates: Partial<ConversionJob>): Promise<void> {
  const { files: _files, totalFiles: _totalFiles, totalSizeBytes: _totalSize, ...fields } = updates;
  await dbRequest(id, "PATCH", fields);
}
export async function addFile(id: string, file: ConversionFile): Promise<void> {
  await dbRequest(`${id}/files/${fileKey(file.path)}`, "PUT", file);
}
export async function consumeDownloadRequest(id: string): Promise<ConversionJob | undefined> {
  const job = await getJob(id);
  if (!job) return undefined;
  if (job.requestsUsed >= job.maxRequests) return undefined;
  await updateJob(id, { requestsUsed: job.requestsUsed + 1 });
  return { ...job, requestsUsed: job.requestsUsed + 1 };
}
