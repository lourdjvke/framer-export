import { randomUUID } from "crypto";

export type FileCategory = "html" | "css" | "js" | "image" | "video" | "font" | "json" | "other";

export interface ConversionFile {
  path: string;
  originalUrl: string;
  size: number;
  mimeType: string;
  category: FileCategory;
}

export type JobStatus = "pending" | "crawling" | "downloading" | "processing" | "done" | "error";

export interface ConversionJob {
  id: string;
  url: string;
  status: JobStatus;
  progress: number;
  message: string;
  totalFiles: number;
  totalSizeBytes: number;
  files: ConversionFile[];
  previewPath: string | null;
  downloadPath: string | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

const jobs = new Map<string, ConversionJob>();

export function createJob(url: string): ConversionJob {
  const id = randomUUID();
  const job: ConversionJob = {
    id,
    url,
    status: "pending",
    progress: 0,
    message: "Starting conversion…",
    totalFiles: 0,
    totalSizeBytes: 0,
    files: [],
    previewPath: null,
    downloadPath: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    errorMessage: null,
  };
  jobs.set(id, job);

  // Expire jobs after 2 hours
  setTimeout(() => jobs.delete(id), 2 * 60 * 60 * 1000);

  return job;
}

export function getJob(id: string): ConversionJob | undefined {
  return jobs.get(id);
}

export function listJobs(): ConversionJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function updateJob(id: string, updates: Partial<ConversionJob>): void {
  const job = jobs.get(id);
  if (job) {
    Object.assign(job, updates);
    jobs.set(id, job);
  }
}

export function addFile(id: string, file: ConversionFile): void {
  const job = jobs.get(id);
  if (job) {
    // Deduplicate: if we already recorded this path, just update size if changed
    const existing = job.files.find((f) => f.path === file.path);
    if (existing) {
      const sizeDiff = file.size - existing.size;
      Object.assign(existing, file);
      job.totalSizeBytes += sizeDiff;
    } else {
      job.files.push(file);
      job.totalFiles = job.files.length;
      job.totalSizeBytes += file.size;
    }
    jobs.set(id, job);
  }
}
