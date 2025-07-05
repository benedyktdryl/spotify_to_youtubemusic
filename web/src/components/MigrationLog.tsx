import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, XCircle, Info, AlertCircle, Trash2 } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
}

interface MigrationLogProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export function MigrationLog({ logs, onClearLogs }: MigrationLogProps) {
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      const scrollArea = document.querySelector('#migration-log-scroll .scroll-area-viewport');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  }, [logs, autoScroll]);

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const getLogBadge = (type: LogEntry['type']) => {
    const variants = {
      info: 'bg-blue-100 text-blue-800 border-blue-200',
      success: 'bg-green-100 text-green-800 border-green-200',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      error: 'bg-red-100 text-red-800 border-red-200'
    };

    return (
      <Badge className={`flex items-center gap-1 ${variants[type]} text-xs`}>
        {getLogIcon(type)}
        {type.toUpperCase()}
      </Badge>
    );
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Migration Log
            <Badge variant="outline" className="text-xs">
              {logs.length} entries
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className={autoScroll ? 'bg-primary/10' : ''}
            >
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClearLogs}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full w-full" id="migration-log-scroll">
          <div className="px-6 pb-6">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center min-h-[200px]">
              <Info className="h-8 w-8 text-gray-400 mb-2" />
              <p className="text-gray-600">No migration logs yet</p>
              <p className="text-sm text-gray-500">Start a migration to see logs here</p>
            </div>
          ) : (
            <div className="space-y-3 pr-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getLogBadge(log.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {log.message}
                      </p>
                      <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                        {log.timestamp}
                      </span>
                    </div>
                    {log.details && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {log.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}