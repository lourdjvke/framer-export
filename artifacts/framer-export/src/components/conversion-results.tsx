import { useGetConversionStats, getGetConversionStatsQueryKey } from "@workspace/api-client-react";
import type { ConversionJob } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import { Download, ExternalLink, FileText, Image, Code, FileCode, Type, File, Video } from "lucide-react";

interface ConversionResultsProps {
  job: ConversionJob;
}

const categoryIcons: Record<string, React.ReactNode> = {
  html: <FileText className="w-4 h-4" />,
  css: <FileCode className="w-4 h-4" />,
  js: <Code className="w-4 h-4" />,
  image: <Image className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  font: <Type className="w-4 h-4" />,
  json: <FileCode className="w-4 h-4" />,
  other: <File className="w-4 h-4" />,
};

const categoryColors: Record<string, string> = {
  html: "bg-blue-100 text-blue-700 border-blue-200",
  css: "bg-purple-100 text-purple-700 border-purple-200",
  js: "bg-yellow-100 text-yellow-700 border-yellow-200",
  image: "bg-green-100 text-green-700 border-green-200",
  video: "bg-red-100 text-red-700 border-red-200",
  font: "bg-pink-100 text-pink-700 border-pink-200",
  json: "bg-orange-100 text-orange-700 border-orange-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

export function ConversionResults({ job }: ConversionResultsProps) {
  const { data: stats } = useGetConversionStats(job.id, {
    query: {
      queryKey: getGetConversionStatsQueryKey(job.id),
    },
  });

  const groupedFiles = job.files.reduce((acc, file) => {
    if (!acc[file.category]) acc[file.category] = [];
    acc[file.category].push(file);
    return acc;
  }, {} as Record<string, typeof job.files>);

  return (
    <div className="space-y-6" data-testid="conversion-results">
      {/* Summary Stats */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Total Files</p>
          <p className="text-2xl font-semibold" data-testid="text-total-files">{job.totalFiles}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Total Size</p>
          <p className="text-2xl font-semibold" data-testid="text-total-size">{formatBytes(job.totalSizeBytes)}</p>
        </div>
      </div>

      {/* Category Summary */}
      {stats && (
        <div className="flex flex-wrap gap-2" data-testid="category-stats">
          {stats.byCategory.map((cat) => (
            <Badge
              key={cat.category}
              variant="outline"
              className={`${categoryColors[cat.category] || categoryColors.other} gap-1.5 px-3 py-1.5`}
              data-testid={`badge-category-${cat.category}`}
            >
              {categoryIcons[cat.category] || categoryIcons.other}
              <span className="font-medium">{cat.count}</span>
              <span className="text-xs opacity-75">{cat.category}</span>
              <span className="text-xs opacity-75">·</span>
              <span className="text-xs opacity-75">{formatBytes(cat.sizeBytes)}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {job.previewPath && (
          <Button
            asChild
            variant="outline"
            className="flex-1 h-12 gap-2 font-medium"
            data-testid="button-preview"
          >
            <a href={job.previewPath + "/"} target="_blank" rel="noopener noreferrer">
              Preview Site
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        )}
        {job.downloadPath && (
          <Button
            asChild
            className="flex-1 h-12 gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium"
            data-testid="button-download"
          >
            <a href={job.downloadPath} download>
              Download ZIP
              <Download className="w-4 h-4" />
            </a>
          </Button>
        )}
      </div>

      {/* File Tree */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Files</h3>
        <ScrollArea className="h-[400px] rounded-lg border border-border bg-card">
          <div className="p-4 space-y-4">
            {Object.entries(groupedFiles).map(([category, files], catIndex) => (
              <div
                key={category}
                className="space-y-1 animate-stagger-in"
                style={{ animationDelay: `${catIndex * 50}ms` }}
                data-testid={`file-group-${category}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1 rounded ${categoryColors[category] || categoryColors.other}`}>
                    {categoryIcons[category] || categoryIcons.other}
                  </div>
                  <span className="text-sm font-medium capitalize">{category}</span>
                  <span className="text-xs text-muted-foreground">({files.length})</span>
                </div>
                {files.map((file) => (
                  <div
                    key={`${category}-${file.path}`}
                    className="flex items-center justify-between py-1.5 px-3 rounded hover:bg-muted/50 transition-colors"
                    data-testid={`file-${file.path}`}
                  >
                    <span className="text-sm font-mono text-foreground truncate flex-1">{file.path}</span>
                    <span className="text-xs text-muted-foreground ml-4 tabular-nums">{formatBytes(file.size)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
