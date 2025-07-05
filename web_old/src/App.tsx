import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import './index.css';

interface Playlist {
  id: string;
  name: string;
  tracks: number;
  migrationStatus?: string; // Added migration status
}

function AuthSection() {
  const [spotifyAuthenticated, setSpotifyAuthenticated] = useState(false);
  const [youtubeAuthenticated, setYoutubeAuthenticated] = useState(false);

  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3000/status");
      const data = await response.json();
      setSpotifyAuthenticated(data.spotifyAuthenticated);
      setYoutubeAuthenticated(data.youtubeAuthenticated);
    } catch (error) {
      console.error("Error fetching auth status:", error);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();

    const urlParams = new URLSearchParams(window.location.search);
    const service = urlParams.get('service');
    const status = urlParams.get('status');
    const message = urlParams.get('message');

    if (service && status) {
      if (status === 'success') {
        console.log(`${service} authentication successful.`);
        // Re-check auth status to update badges
        checkAuthStatus();
      } else {
        console.error(`${service} authentication failed: ${message}`);
      }
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [checkAuthStatus]);

  const handleSpotifyLogin = async () => {
    try {
      const response = await fetch("http://localhost:3000/spotify/auth");
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        console.error("Failed to get Spotify auth URL:", data);
      }
    } catch (error) {
      console.error("Error initiating Spotify login:", error);
    }
  };

  const handleYoutubeLogin = async () => {
    try {
      const response = await fetch("http://localhost:3000/youtube/auth");
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        console.error("Failed to get YouTube auth URL:", data);
      }
    } catch (error) {
      console.error("Error initiating YouTube login:", error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authenticate Services</CardTitle>
        <CardDescription>Connect your Spotify and YouTube Music accounts.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col space-y-4">
        <div className="flex items-center space-x-4">
          <Button onClick={handleSpotifyLogin}>Login with Spotify</Button>
          {spotifyAuthenticated ? (
            <Badge variant="default">Authenticated</Badge>
          ) : (
            <Badge variant="destructive">Not Authenticated</Badge>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <Button onClick={handleYoutubeLogin}>Login with YouTube</Button>
          {youtubeAuthenticated ? (
            <Badge variant="default">Authenticated</Badge>
          ) : (
            <Badge variant="destructive">Not Authenticated</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PlaylistSelectionSection({ onPlaylistSelect, onSelectedPlaylistChange, refreshPlaylists }: { onPlaylistSelect: (playlistId: string | null) => void, onSelectedPlaylistChange: (playlist: Playlist | null) => void, refreshPlaylists: () => void }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const fetchPlaylistsAndStatus = useCallback(async () => {
    try {
      const [playlistsResponse, migrationStatusResponse] = await Promise.all([
        fetch("http://localhost:3000/spotify/playlists"),
        fetch("http://localhost:3000/migration/status"),
      ]);

      if (playlistsResponse.ok) {
        const playlistsData: Playlist[] = await playlistsResponse.json();
        const migrationStatusData: { [key: string]: string } = migrationStatusResponse.ok ? await migrationStatusResponse.json() : {};

        const playlistsWithStatus = playlistsData.map(playlist => ({
          ...playlist,
          migrationStatus: migrationStatusData[playlist.id] || 'not_started',
        }));
        setPlaylists(playlistsWithStatus);
      } else {
        console.error("Error fetching playlists:", await playlistsResponse.text());
      }
    } catch (error) {
      console.error("Error fetching playlists or migration status:", error);
    }
  }, []);

  useEffect(() => {
    fetchPlaylistsAndStatus();
  }, [fetchPlaylistsAndStatus, refreshPlaylists]); // Added refreshPlaylists to dependency array

  const handleSelectChange = (value: string) => {
    setSelectedPlaylistId(value);
    onPlaylistSelect(value);
    const selected = playlists.find(p => p.id === value);
    onSelectedPlaylistChange(selected || null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Playlist</CardTitle>
        <CardDescription>Choose a Spotify playlist to migrate.</CardDescription>
      </CardHeader>
      <CardContent>
        <Select onValueChange={handleSelectChange} value={selectedPlaylistId || ""}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select a playlist" />
          </SelectTrigger>
          <SelectContent>
            {playlists.map((playlist) => (
              <SelectItem key={playlist.id} value={playlist.id}>
                <div className="flex items-center justify-between w-full">
                  <span>{playlist.name} ({playlist.tracks} tracks)</span>
                  {playlist.migrationStatus && (
                    <Badge variant={playlist.migrationStatus === 'completed' ? 'default' : playlist.migrationStatus === 'failed' ? 'destructive' : 'secondary'}>
                      {playlist.migrationStatus.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedPlaylistId && (
          <p className="mt-4">Selected playlist: {playlists.find(p => p.id === selectedPlaylistId)?.name}</p>
        )}
      </CardContent>
    </Card>
  );
}

function MigrateSection({ selectedPlaylist, onMigrationActionComplete }: { selectedPlaylist: Playlist | null, onMigrationActionComplete: () => void }) {
  const [isMigrating, setIsMigrating] = useState(false);
  const [isRecreating, setIsRecreating] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleMigrate = async () => {
    if (!selectedPlaylist || !selectedPlaylist.id) {
      setMessage("Please select a playlist first.");
      setIsError(true);
      return;
    }

    setIsMigrating(true);
    setCurrentTrack(null);
    setMigrationLogs([]);
    setMessage(null);
    setIsError(false);

    const eventSource = new EventSource(`http://localhost:3000/migrate/${selectedPlaylist.id}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "progress") {
        setCurrentTrack(data.message);
        setMigrationLogs((prevLogs) => [...prevLogs, data.message]);
      } else if (data.type === "complete") {
        setMessage(data.message);
        setIsError(false);
        eventSource.close();
        setIsMigrating(false);
        onMigrationActionComplete(); // Notify parent to refresh playlists
      } else if (data.type === "error") {
        setMessage(data.message);
        setIsError(true);
        eventSource.close();
        setIsMigrating(false);
        onMigrationActionComplete(); // Notify parent to refresh playlists
      }
    };

    eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      setMessage("Migration failed due to a connection error.");
      setIsError(true);
      eventSource.close();
      setIsMigrating(false);
      onMigrationActionComplete(); // Notify parent to refresh playlists
    };
  };

  const handleRecreate = async () => {
    if (!selectedPlaylist || !selectedPlaylist.id) {
      setMessage("Please select a playlist first.");
      setIsError(true);
      return;
    }

    setIsRecreating(true);
    setMessage(null);
    setIsError(false);

    try {
      const response = await fetch(`http://localhost:3000/migration/${selectedPlaylist.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
        setIsError(false);
        setCurrentTrack(null);
        setMigrationLogs([]);
        onMigrationActionComplete(); // Notify parent to refresh playlists
      } else {
        setMessage(data.message || "Failed to clear migration data.");
        setIsError(true);
      }
    } catch (error: any) {
      setMessage(error.message || "An unexpected error occurred while clearing data.");
      setIsError(true);
    } finally {
      setIsRecreating(false);
    }
  };

  const getMigrateButtonText = () => {
    if (isMigrating) return "Migrating...";
    if (!selectedPlaylist) return "Select a playlist";
    switch (selectedPlaylist.migrationStatus) {
      case 'completed':
        return "Migration Complete";
      case 'in_progress':
      case 'failed':
        return "Resume Migration";
      default:
        return "Start Migration";
    }
  };

  const showRecreateButton = selectedPlaylist && (selectedPlaylist.migrationStatus === 'completed' || selectedPlaylist.migrationStatus === 'failed');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Migrate Playlist</CardTitle>
        <CardDescription>Start the migration process.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex space-x-2">
          <Button onClick={handleMigrate} disabled={!selectedPlaylist || isMigrating || selectedPlaylist.migrationStatus === 'completed'}>
            {getMigrateButtonText()}
          </Button>
          {showRecreateButton && (
            <Button onClick={handleRecreate} disabled={isRecreating} variant="outline">
              {isRecreating ? "Clearing..." : "Recreate Migration"}
            </Button>
          )}
        </div>
        {currentTrack && <p className="mt-4">Current: {currentTrack}</p>}
        {migrationLogs.length > 0 && (
          <div className="mt-4 p-2 border rounded h-32 overflow-y-auto text-sm">
            {migrationLogs.map((log, index) => (
              <p key={index}>{log}</p>
            ))}
          </div>
        )}
        {message && (
          <p className={`mt-4 ${isError ? "text-red-500" : "text-green-500"}`}>
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigurationSection() {
  const [matchThreshold, setMatchThreshold] = useState<number[]>([0.5]);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const fetchMatchThreshold = async () => {
      try {
        const response = await fetch("http://localhost:3000/config/match_threshold");
        if (response.ok) {
          const data = await response.json();
          setMatchThreshold([data.match_threshold]);
        } else {
          console.error("Error fetching match threshold:", await response.text());
        }
      } catch (error) {
        console.error("Error fetching match threshold:", error);
      }
    };

    fetchMatchThreshold();
  }, []);

  const handleSliderChange = async (value: number[]) => {
    setMatchThreshold(value);
    try {
      const response = await fetch("http://localhost:3000/config/match_threshold", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: value[0] }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setIsError(false);
      } else {
        setMessage(data.message || "Failed to update match threshold.");
        setIsError(true);
      }
    } catch (error: any) {
      setMessage(error.message || "An unexpected error occurred.");
      setIsError(true);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
        <CardDescription>Adjust migration settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4">
          <div>
            <label htmlFor="match-threshold" className="block text-sm font-medium text-gray-700">Match Threshold: {matchThreshold[0].toFixed(2)}</label>
            <Slider
              id="match-threshold"
              min={0}
              max={1}
              step={0.01}
              value={matchThreshold}
              onValueChange={handleSliderChange}
              className="w-[280px] mt-2"
            />
          </div>
          {message && (
            <p className={`mt-2 ${isError ? "text-red-500" : "text-green-500"}`}>
              {message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function App() {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [refreshPlaylistsTrigger, setRefreshPlaylistsTrigger] = useState(0);

  const handleMigrationActionComplete = useCallback(() => {
    setRefreshPlaylistsTrigger(prev => prev + 1);
  }, []);

  return (
    <div className="min-h-screen bg-background font-sans antialiased">
      <header className="container mx-auto py-4 border-b">
        <h1 className="text-2xl font-bold">Spotify to YouTube Music Migrator</h1>
      </header>
      <main className="container mx-auto py-8 space-y-8">
        <AuthSection />
        <PlaylistSelectionSection 
          onPlaylistSelect={setSelectedPlaylistId} 
          onSelectedPlaylistChange={setSelectedPlaylist} 
          refreshPlaylists={handleMigrationActionComplete} // Pass callback to refresh playlists
        />
        <MigrateSection 
          selectedPlaylist={selectedPlaylist} 
          onMigrationActionComplete={handleMigrationActionComplete} // Pass callback to refresh playlists
        />
        <ConfigurationSection />
      </main>
    </div>
  );
}

export default App;