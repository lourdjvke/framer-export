import { useEffect, useState } from "react";
import { useGetConversion, getGetConversionQueryKey } from "@workspace/api-client-react";
import type { ConversionJob } from "@workspace/api-client-react";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";

interface ConversionProgressProps {
  jobId: string;
  onComplete: (job: ConversionJob) => void;
  onError: (error: string) => void;
}

export function ConversionProgress({ jobId, onComplete, onError }: ConversionProgressProps) {
  const queryClient = useQueryClient();
  const { data: job, isLoading, isError } = useGetConversion(jobId, {
    query: {
      queryKey: getGetConversionQueryKey(jobId),
      refetchInterval: (query) => {
        const data = query.state.data as ConversionJob | undefined;
        if (!data) return false;
        if (data.status === "done" || data.status === "error") return false;
        return 2000; // Poll every 2 seconds while in progress
      },
    },
  });

  useEffect(() => {
    if (job?.status === "done") {
      onComplete(job);
    } else if (job?.status === "error") {
      onError(job.errorMessage || "Conversion failed");
    }
  }, [job, onComplete, onError]);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="conversion-loading">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/4 bg-primary animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground">Initializing...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-sm text-destructive" data-testid="conversion-error">
        Failed to load conversion status
      </div>
    );
  }

  if (!job) return null;

  const statusMessages: Record<string, string> = {
    pending: "Queued",
    crawling: "Crawling site structure",
    downloading: "Downloading assets",
    processing: "Processing files",
    done: "Complete",
    error: "Failed",
  };

  return (
    <div className="space-y-3" data-testid="conversion-progress">
      <Progress value={job.progress} className="h-2" data-testid="progress-bar" />
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{statusMessages[job.status] || job.message}</span>
        <span className="font-medium tabular-nums">{Math.round(job.progress)}%</span>
      </div>
    </div>
  );
}
