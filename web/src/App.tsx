
import { useState, useEffect, useCallback } from 'react';
import { AuthenticationCard } from '@/components/AuthenticationCard';
import { PlaylistTable } from '@/components/PlaylistTable';
import { MigrationLog } from '@/components/MigrationLog';
import { DebugSection } from '@/components/DebugSection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Music, Play, Headphones, XCircle, CheckCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from './components/ui/button';

interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: string;
}

interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  isPublic: boolean;
  lastModified: string;
  status: 'pending' | 'migrating' | 'completed' | 'failed' | 'not_started';
  description?: string;
}

function App() {
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [isYouTubeConnected, setIsYouTubeConnected] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: 'Application started',
      details: 'Spotify to YouTube Music Migrator v1.0.0'
    },
    {
      id: '2',
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: 'Checking authentication status',
      details: 'Verifying saved credentials for both services'
    }
  ]);
  const [debugInfo, setDebugInfo] = useState<{
    apiStatus: { spotify: 'connected' | 'disconnected'; youtube: 'connected' | 'disconnected' };
    systemInfo: { userAgent: string; timestamp: string; sessionId: string };
    permissions: { spotifyScopes: string[]; youtubeScopes: string[] };
    youtubeAuthType: 'oauth' | 'browser' | 'disconnected';
  }>({
    apiStatus: { spotify: 'disconnected', youtube: 'disconnected' },
    systemInfo: {
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      sessionId: Math.random().toString(36).substring(2, 15),
    },
    permissions: {
      spotifyScopes: ['playlist-read-private', 'playlist-read-collaborative'],
      youtubeScopes: ['https://www.googleapis.com/auth/youtube'],
    },
    youtubeAuthType: 'disconnected',
  });
  const [youtubeAuthMethod, setYoutubeAuthMethod] = useState<'oauth' | 'browser' | null>(null);
  const [youtubeBrowserHeaders, setYoutubeBrowserHeaders] = useState('');
  

  const addLog = useCallback((type: LogEntry['type'], message: string, details?: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(2, 15),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      details,
    };
    setLogs(prev => [...prev, newLog]);
  }, []);

  const fetchAuthStatus = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3000/status");
      const data = await response.json();
      setIsSpotifyConnected(data.spotifyAuthenticated);
      setIsYouTubeConnected(data.youtubeAuthenticated);
      setDebugInfo(prev => ({
        ...prev,
        apiStatus: {
          spotify: data.spotifyAuthenticated ? 'connected' : 'disconnected',
          youtube: data.youtubeAuthenticated ? 'connected' : 'disconnected',
        },
        youtubeAuthType: data.youtubeAuthenticated
          ? "oauth" // or "browser" if you know the method
          : "disconnected",
      }));
      addLog('info', 'Authentication status updated', `Spotify: ${data.spotifyAuthenticated ? 'Connected' : 'Disconnected'}, YouTube: ${data.youtubeAuthenticated ? 'Connected' : 'Disconnected'}`);
    } catch (error) {
      console.error("Error fetching auth status:", error);
      addLog('error', 'Failed to fetch authentication status', String(error));
    }
  }, [addLog]);

  useEffect(() => {
    fetchAuthStatus();

    const urlParams = new URLSearchParams(window.location.search);
    const service = urlParams.get('service');
    const status = urlParams.get('status');
    const message = urlParams.get('message');

    if (service && status) {
      if (status === 'success') {
        addLog('success', `${service} authentication successful.`, message || '');
        fetchAuthStatus(); // Re-fetch auth status to update badges
      } else {
        addLog('error', `${service} authentication failed.`, message || '');
      }
      window.history.replaceState({}, document.title, window.location.pathname); // Clean up URL parameters
    }
  }, [fetchAuthStatus]);

  const handleSpotifyConnect = async () => {
    try {
      const response = await fetch("http://localhost:3000/spotify/auth");
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        addLog('error', 'Failed to get Spotify auth URL', data.message || JSON.stringify(data));
      }
    } catch (error) {
      addLog('error', 'Error initiating Spotify login', String(error));
    }
  };

  const handleSpotifyDisconnect = async () => {
    try {
      const response = await fetch("http://localhost:3000/tokens/spotify", {
        method: "DELETE",
      });
      const data = await response.json();
      if (response.ok) {
        addLog('info', 'Disconnected from Spotify', data.message);
        fetchAuthStatus(); // Re-fetch auth status to update badges
      } else {
        addLog('error', 'Failed to disconnect from Spotify', data.message || JSON.stringify(data));
      }
    } catch (error) {
      addLog('error', 'Error disconnecting from Spotify', String(error));
    }
  };

  const handleYouTubeConnect = async () => {
    setYoutubeAuthMethod('oauth');
    try {
      const response = await fetch("http://localhost:3000/youtube/auth");
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        addLog('error', 'Failed to get YouTube OAuth URL', data.message || JSON.stringify(data));
      }
    } catch (error) {
      addLog('error', 'Error initiating YouTube OAuth login', String(error));
    }
  };

  const handleYouTubeBrowserConnect = async () => {
    if (!youtubeBrowserHeaders) {
      addLog('error', 'YouTube browser headers are empty', 'Please paste the JSON headers.');
      return;
    }
    try {
      const response = await fetch("http://localhost:3000/youtube/auth/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: youtubeBrowserHeaders }),
      });
      const data = await response.json();
      if (response.ok) {
        addLog('success', 'YouTube browser authentication successful.', data.message);
        fetchAuthStatus();
        setYoutubeAuthMethod(null); // Hide input after successful connection
      } else {
        addLog('error', 'YouTube browser authentication failed.', data.message || JSON.stringify(data));
      }
    } catch (error) {
      addLog('error', 'Error during YouTube browser authentication', String(error));
    }
  };

  

  const handleYouTubeDisconnect = async () => {
    try {
      const response = await fetch("http://localhost:3000/tokens/youtube", {
        method: "DELETE",
      });
      const data = await response.json();
      if (response.ok) {
        addLog('info', 'Disconnected from YouTube Music', data.message);
        fetchAuthStatus(); // Re-fetch auth status to update badges
      } else {
        addLog('error', 'Failed to disconnect from YouTube Music', data.message || JSON.stringify(data));
      }
    } catch (error) {
      addLog('error', 'Error disconnecting from YouTube Music', String(error));
    }
  };

  const handleMigrate = async (playlistIds: string[]) => {
    addLog('info', `Starting migration for ${playlistIds.length} playlist(s)`, 'Initiating SSE connection...');

    for (const playlistId of playlistIds) {
      // Update playlist status to migrating
      setPlaylists(prev => prev.map(p =>
        p.id === playlistId ? { ...p, status: 'migrating' } : p
      ));

      const eventSource = new EventSource(`http://localhost:3000/migrate/${playlistId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const logType = data.type === 'error' ? 'error' : data.type === 'complete' ? 'success' : 'info';
        addLog(logType, data.message, data.details);

        if (data.type === 'complete' || data.type === 'error') {
          eventSource.close();
          // Re-fetch playlists to update their status in the table
          fetchPlaylists(); // Assuming fetchPlaylists is available in this scope
        }
      };

      eventSource.onerror = (error) => {
        console.error("EventSource error:", error);
        addLog('error', 'Migration failed due to connection error', String(error));
        eventSource.close();
        // Re-fetch playlists to update their status in the table
        fetchPlaylists(); // Assuming fetchPlaylists is available in this scope
      };
    }
  };

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    let response = await fetch(url, options);

    if (response.status === 401) {
      addLog('info', 'Spotify token expired, refreshing...');
      const refreshResponse = await fetch("http://localhost:3000/spotify/refresh");
      if (refreshResponse.ok) {
        addLog('success', 'Spotify token refreshed successfully');
        response = await fetch(url, options); // Retry the original request
      } else {
        addLog('error', 'Failed to refresh Spotify token', await refreshResponse.text());
        // Handle failed refresh (e.g., redirect to login)
        setIsSpotifyConnected(false);
      }
    }

    return response;
  }, [addLog]);

  const fetchPlaylists = useCallback(async () => {
    try {
      const response = await fetchWithAuth("http://localhost:3000/spotify/playlists");
      if (response.ok) {
        const data: Playlist[] = await response.json();
        setPlaylists(data);
        addLog('info', 'Playlists loaded', `Found ${data.length} playlists.`);
      } else {
        addLog('error', 'Failed to load playlists', await response.text());
      }
    } catch (error) {
      addLog('error', 'Error fetching playlists', String(error));
    }
  }, [addLog, fetchWithAuth]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const refreshDebugInfo = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3000/debug/info");
      const data = await response.json();
      setDebugInfo(data);
      addLog('info', 'Debug information refreshed');
    } catch (error) {
      console.error("Error fetching debug info:", error);
      addLog('error', 'Failed to refresh debug information', String(error));
    }
  }, [addLog]);

  const clearLogs = () => {
    setLogs([]);
    addLog('info', 'Migration logs cleared');
  };

  const connectionCount = (isSpotifyConnected ? 1 : 0) + (isYouTubeConnected ? 1 : 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex justify-center">
      <div className="px-4 py-8 max-w-7xl w-full" style={{ margin: '0 auto' }}>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Music className="h-8 w-8 text-green-600" />
              <ArrowRight className="h-5 w-5 text-gray-400" />
              <Play className="h-8 w-8 text-red-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Spotify to YouTube Music Migrator
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Seamlessly transfer your playlists from Spotify to YouTube Music
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Badge variant="outline" className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${
                connectionCount === 2 ? 'bg-green-500' :
                connectionCount === 1 ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              {connectionCount}/2 Services Connected
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {playlists.length} Playlists Available
            </Badge>
          </div>
        </div>

        {/* Authentication Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AuthenticationCard
            title="Spotify"
            description="Connect your Spotify account to access playlists"
            icon={<Music className="h-6 w-6 text-green-600" />}
            isConnected={isSpotifyConnected}
            onConnect={handleSpotifyConnect}
            onDisconnect={handleSpotifyDisconnect}
          />
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Headphones className="h-6 w-6 text-red-600" />
                  <div>
                    <CardTitle className="text-lg font-semibold">YouTube Music</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                      Connect YouTube Music to create playlists
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant={isYouTubeConnected ? "default" : "secondary"}
                  className={`flex items-center gap-1 ${
                    isYouTubeConnected
                      ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-100"
                      : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-100"
                  }`}
                >
                  {isYouTubeConnected ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {isYouTubeConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {!isYouTubeConnected && youtubeAuthMethod === null && (
                <div className="flex flex-col space-y-2">
                  <Button onClick={() => setYoutubeAuthMethod('oauth')}>Connect with OAuth</Button>
                  <Button onClick={() => setYoutubeAuthMethod('browser')} variant="outline">Connect with Browser Headers</Button>
                </div>
              )}
              {!isYouTubeConnected && youtubeAuthMethod === 'oauth' && (
                <Button onClick={handleYouTubeConnect}>Initiate OAuth Flow</Button>
              )}
              {!isYouTubeConnected && youtubeAuthMethod === 'browser' && (
                <div className="flex flex-col space-y-2">
                  <Textarea
                    placeholder="Paste YouTube Music browser headers JSON here..."
                    value={youtubeBrowserHeaders}
                    onChange={(e) => setYoutubeBrowserHeaders(e.target.value)}
                    rows={8}
                  />
                  <Button onClick={handleYouTubeBrowserConnect}>Submit Browser Headers</Button>
                  <Button onClick={() => setYoutubeAuthMethod(null)} variant="ghost">Back</Button>
                </div>
              )}
              {isYouTubeConnected && (
                <Button onClick={handleYouTubeDisconnect} className="w-full bg-red-600 hover:bg-red-700 text-white">
                  Disconnect
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
          {/* Playlist Table */}
          <div className="space-y-6">
            <PlaylistTable
              playlists={playlists}
              onMigrate={handleMigrate}
              isSpotifyConnected={isSpotifyConnected}
              isYouTubeConnected={isYouTubeConnected}
            />
          </div>

          {/* Migration Log */}
          <div className="space-y-6">
            <MigrationLog
              logs={logs}
              onClearLogs={clearLogs}
            />
          </div>
        </div>

        {/* Debug Section */}
        <DebugSection
          debugInfo={debugInfo}
          onRefreshDebugInfo={refreshDebugInfo}
        />
      </div>
    </div>
  );
}

export default App;
