import { useState } from "react";
import { useStartConversion } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight } from "lucide-react";

interface ConverterFormProps {
  onJobCreated: (jobId: string) => void;
}

export function ConverterForm({ onJobCreated }: ConverterFormProps) {
  const [url, setUrl] = useState("");
  const { toast } = useToast();
  const startConversion = useStartConversion();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a Framer site URL",
        variant: "destructive",
      });
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    startConversion.mutate(
      { data: { url } },
      {
        onSuccess: (job) => {
          setUrl("");
          onJobCreated(job.id);
        },
        onError: (error: any) => {
          toast({
            title: "Conversion failed",
            description: error?.error || "Failed to start conversion",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="w-full" data-testid="form-converter">
      <div className="flex gap-3">
        <Input
          type="url"
          placeholder="https://example.framer.website"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={startConversion.isPending}
          className="flex-1 h-12 text-base"
          data-testid="input-url"
        />
        <Button
          type="submit"
          disabled={startConversion.isPending}
          className="h-12 px-6 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          data-testid="button-convert"
        >
          {startConversion.isPending ? "Starting..." : "Convert"}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
}
