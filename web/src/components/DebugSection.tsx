import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Bug, Wifi, Database, Key } from 'lucide-react';

interface DebugInfo {
  apiStatus: {
    spotify: 'connected' | 'disconnected' | 'error';
    youtube: 'connected' | 'disconnected' | 'error';
  };
  systemInfo: {
    userAgent: string;
    timestamp: string;
    sessionId: string;
  };
  permissions: {
    spotifyScopes: string[];
    youtubeScopes: string[];
  };
  youtubeAuthType: 'oauth' | 'browser' | 'disconnected'; // Added youtubeAuthType
}

interface DebugSectionProps {
  debugInfo: DebugInfo;
  onRefreshDebugInfo: () => void;
}

export function DebugSection({ debugInfo, onRefreshDebugInfo }: DebugSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getStatusBadge = (status: string) => {
    const variants = {
      connected: 'bg-green-100 text-green-800 border-green-200',
      disconnected: 'bg-gray-100 text-gray-800 border-gray-200',
      error: 'bg-red-100 text-red-800 border-red-200'
    };

    return (
      <Badge className={`text-xs ${variants[status as keyof typeof variants]}`}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <Card className="bg-gray-50 dark:bg-gray-900 border-dashed">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bug className="h-4 w-4" />
                Debug Information
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Development Mode
                </Badge>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onRefreshDebugInfo}
                className="text-xs"
              >
                Refresh Debug Info
              </Button>
            </div>

            {/* API Status */}
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 font-medium text-sm">
                <Wifi className="h-4 w-4" />
                API Status
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800">
                  <span className="text-sm">Spotify API</span>
                  {getStatusBadge(debugInfo.apiStatus.spotify)}
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800">
                  <span className="text-sm">YouTube API</span>
                  {getStatusBadge(debugInfo.apiStatus.youtube)}
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800 col-span-2">
                  <span className="text-sm">YouTube Auth Type</span>
                  <Badge className="text-xs">
                    {debugInfo.youtubeAuthType.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            {/* System Information */}
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 font-medium text-sm">
                <Database className="h-4 w-4" />
                System Information
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800">
                  <span className="text-sm">Session ID</span>
                  <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {debugInfo.systemInfo.sessionId}
                  </code>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-800">
                  <span className="text-sm">Last Updated</span>
                  <span className="text-xs text-gray-600">
                    {debugInfo.systemInfo.timestamp}
                  </span>
                </div>
                <div className="flex items-start justify-between p-3 rounded-lg bg-white dark:bg-gray-800">
                  <span className="text-sm">User Agent</span>
                  <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded max-w-xs truncate">
                    {debugInfo.systemInfo.userAgent}
                  </code>
                </div>
              </div>
            </div>

            {/* Permissions */}
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 font-medium text-sm">
                <Key className="h-4 w-4" />
                API Permissions
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-white dark:bg-gray-800">
                  <div className="text-sm font-medium mb-2">Spotify Scopes</div>
                  <div className="space-y-1">
                    {debugInfo.permissions.spotifyScopes.map((scope, index) => (
                      <Badge key={index} variant="outline" className="text-xs mr-1">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-gray-800">
                  <div className="text-sm font-medium mb-2">YouTube Scopes</div>
                  <div className="space-y-1">
                    {debugInfo.permissions.youtubeScopes.map((scope, index) => (
                      <Badge key={index} variant="outline" className="text-xs mr-1">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
