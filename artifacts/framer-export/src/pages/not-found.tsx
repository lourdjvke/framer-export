import { Link } from "wouter";
import { Home, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted">
          <AlertTriangle className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">404</h1>
          <p className="text-lg text-muted-foreground">
            Page not found
          </p>
          <p className="text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/">
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
