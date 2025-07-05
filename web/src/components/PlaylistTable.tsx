import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, Music, Users, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  isPublic: boolean;
  lastModified: string;
  status: 'pending' | 'migrating' | 'completed' | 'failed' | 'not_started';
  description?: string;
}

interface PlaylistTableProps {
  playlists: Playlist[];
  onMigrate: (playlistIds: string[]) => void;
  isSpotifyConnected: boolean;
  isYouTubeConnected: boolean;
}

export function PlaylistTable({
  playlists,
  onMigrate,
  isSpotifyConnected,
  isYouTubeConnected
}: PlaylistTableProps) {
  const [selectedPlaylists, setSelectedPlaylists] = useState<string[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);

  const togglePlaylist = (playlistId: string) => {
    setSelectedPlaylists(prev =>
      prev.includes(playlistId)
        ? prev.filter(id => id !== playlistId)
        : [...prev, playlistId]
    );
  };

  const toggleAll = () => {
    const availablePlaylists = playlists.filter(p => p.status === 'not_started' || p.status === 'pending').map(p => p.id);
    setSelectedPlaylists(prev =>
      prev.length === availablePlaylists.length ? [] : availablePlaylists
    );
  };

  const handleMigrate = async () => {
    if (selectedPlaylists.length === 0) return;

    setIsMigrating(true);
    await onMigrate(selectedPlaylists);
    setIsMigrating(false);
    setSelectedPlaylists([]);
  };

  const getStatusIcon = (status: Playlist['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'migrating':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: Playlist['status']) => {
    const variants = {
      pending: 'bg-gray-100 text-gray-800 border-gray-200',
      not_started: 'bg-gray-100 text-gray-800 border-gray-200',
      migrating: 'bg-blue-100 text-blue-800 border-blue-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      failed: 'bg-red-100 text-red-800 border-red-200'
    };

    return (
      <Badge className={`flex items-center gap-1 ${variants[status]}`}>
        {getStatusIcon(status)}
        {status.replace(/_/g, ' ').charAt(0).toUpperCase() + status.replace(/_/g, ' ').slice(1)}
      </Badge>
    );
  };

  const canMigrate = isSpotifyConnected && isYouTubeConnected && selectedPlaylists.length > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Spotify Playlists
          </CardTitle>
          <Button
            onClick={handleMigrate}
            disabled={!canMigrate || isMigrating}
            className="flex items-center gap-2"
          >
            {isMigrating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Migrating...
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4" />
                Migrate Selected ({selectedPlaylists.length})
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Music className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No playlists found</h3>
            <p className="text-gray-600">Connect to Spotify to see your playlists</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedPlaylists.length === playlists.filter(p => p.status === 'not_started' || p.status === 'pending').length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Tracks</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {playlists.map((playlist) => (
                <TableRow
                  key={playlist.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedPlaylists.includes(playlist.id)}
                      onCheckedChange={() => togglePlaylist(playlist.id)}
                      disabled={playlist.status !== 'not_started' && playlist.status !== 'pending'}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{playlist.name}</span>
                      {playlist.description && (
                        <span className="text-sm text-gray-500 truncate max-w-xs">
                          {playlist.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <Music className="h-3 w-3" />
                      {playlist.trackCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={playlist.isPublic ? "default" : "secondary"} className="text-xs">
                      {playlist.isPublic ? (
                        <><Users className="h-3 w-3 mr-1" />Public</>
                      ) : (
                        <>Private</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {new Date(playlist.lastModified).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(playlist.status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}