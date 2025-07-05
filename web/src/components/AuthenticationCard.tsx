import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Music, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface AuthenticationCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  isLoading?: boolean; // Added isLoading prop
  children?: React.ReactNode; // Added children prop for custom content
}

export function AuthenticationCard({
  title,
  description,
  icon,
  isConnected,
  onConnect,
  onDisconnect,
  isLoading = false,
  children
}: AuthenticationCardProps) {

  return (
    <Card className="relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.02] bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <CardTitle className="text-lg font-semibold">{title}</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                {description}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={isConnected ? "default" : "secondary"}
            className={`flex items-center gap-1 ${
              isConnected
                ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-100"
                : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-100"
            }`}
          >
            {isConnected ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {children ? children : (
          <Button
            onClick={isConnected ? onDisconnect : onConnect}
            disabled={isLoading}
            className={`w-full transition-all duration-200 ${
              isConnected
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isConnected ? 'Disconnecting...' : 'Connecting...'}
              </div>
            ) : (
              isConnected ? 'Disconnect' : 'Connect'
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}