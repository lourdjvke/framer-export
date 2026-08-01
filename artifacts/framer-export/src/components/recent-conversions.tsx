import { useListConversions } from "@workspace/api-client-react";
import type { ConversionJob } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, formatBytes } from "@/lib/utils";
import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface RecentConversionsProps {
  onSelectJob: (jobId: string) => void;
  currentJobId?: string;
}

export function RecentConversions({ onSelectJob, currentJobId }: RecentConversionsProps) {
  const { data: conversions, isLoading } = useListConversions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversions || conversions.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "error":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "text-green-700 bg-green-50 border-green-200";
      case "error":
        return "text-destructive bg-destructive/10 border-destructive/20";
      default:
        return "text-muted-foreground bg-muted/50 border-border";
    }
  };

  return (
    <div className="space-y-3" data-testid="recent-conversions">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Recent Conversions
      </h3>
      <div className="space-y-2">
        {conversions.slice(0, 5).map((job) => (
          <Button
            key={job.id}
            variant="outline"
            onClick={() => onSelectJob(job.id)}
            disabled={currentJobId === job.id}
            className={`w-full h-auto p-3 justify-start text-left hover:bg-muted/50 transition-colors ${
              currentJobId === job.id ? "border-primary bg-primary/5" : ""
            }`}
            data-testid={`button-job-${job.id}`}
          >
            <div className="flex items-start gap-3 w-full">
              {getStatusIcon(job.status)}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium truncate">{new URL(job.url).hostname}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatRelativeTime(job.createdAt)}</span>
                  {job.status === "done" && (
                    <>
                      <span>·</span>
                      <span>{job.totalFiles} files</span>
                      <span>·</span>
                      <span>{formatBytes(job.totalSizeBytes)}</span>
                    </>
                  )}
                </div>
              </div>
              <div className={`text-xs px-2 py-1 rounded border ${getStatusColor(job.status)}`}>
                {job.status}
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
