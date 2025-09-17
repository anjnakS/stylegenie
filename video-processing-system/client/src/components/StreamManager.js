import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios';

const ManagerContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h2`
  text-align: center;
  margin-bottom: 2rem;
  font-size: 2rem;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
`;

const StatCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 2rem;
  font-weight: bold;
  color: #4ade80;
  margin-bottom: 0.5rem;
`;

const StatLabel = styled.div`
  font-size: 1rem;
  opacity: 0.8;
`;

const StreamsList = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
`;

const StreamItem = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1rem;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  align-items: center;
`;

const StreamInfo = styled.div``;

const StreamTitle = styled.h4`
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
`;

const StreamDetails = styled.div`
  font-size: 0.9rem;
  opacity: 0.8;
  font-family: monospace;
`;

const StreamActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const Button = styled.button`
  background: ${props => {
    if (props.variant === 'danger') return 'linear-gradient(135deg, #ef4444, #dc2626)';
    if (props.variant === 'success') return 'linear-gradient(135deg, #22c55e, #16a34a)';
    return 'linear-gradient(135deg, #3b82f6, #2563eb)';
  }};
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  font-size: 0.9rem;
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ControlsPanel = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
`;

const InputGroup = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 1rem;
  margin-bottom: 1rem;
  align-items: end;
`;

const Input = styled.input`
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;

  &::placeholder {
    color: rgba(255, 255, 255, 0.6);
  }
`;

const Select = styled.select`
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
`;

const StatusIndicator = styled.div`
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: ${props => {
    switch (props.status) {
      case 'active': return '#22c55e';
      case 'error': return '#ef4444';
      case 'stopped': return '#6b7280';
      default: return '#f59e0b';
    }
  }};
  margin-right: 0.5rem;
`;

const RefreshButton = styled(Button)`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  border-radius: 50%;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
`;

function StreamManager({ onStreamCountChange }) {
  const [streams, setStreams] = useState([]);
  const [systemStats, setSystemStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [newStreamUrl, setNewStreamUrl] = useState('');
  const [newStreamType, setNewStreamType] = useState('hls');

  useEffect(() => {
    loadStreams();
    loadSystemStats();

    const interval = setInterval(() => {
      loadStreams();
      loadSystemStats();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    onStreamCountChange?.(streams.length);
  }, [streams.length, onStreamCountChange]);

  const loadStreams = async () => {
    try {
      const response = await axios.get('/api/streams');
      const allStreams = [
        ...response.data.rtmp.map(s => ({ ...s, type: 'RTMP' })),
        ...response.data.websocket.map(s => ({ ...s, type: 'WebSocket' }))
      ];
      setStreams(allStreams);
    } catch (error) {
      console.error('Failed to load streams:', error);
    }
  };

  const loadSystemStats = async () => {
    try {
      const response = await axios.get('/api/processing/stats');
      setSystemStats(response.data);
    } catch (error) {
      console.error('Failed to load system stats:', error);
    }
  };

  const createStream = async () => {
    if (!newStreamUrl.trim()) return;

    setLoading(true);
    try {
      const streamId = `stream_${Date.now()}`;
      const endpoint = newStreamType === 'hls' ? 'hls' : 'dash';

      const response = await axios.post(`/api/stream/${endpoint}/${streamId}`, {
        inputUrl: newStreamUrl,
        quality: 'high',
        bitrate: '2000k'
      });

      console.log('Stream created:', response.data);
      setNewStreamUrl('');
      await loadStreams();
    } catch (error) {
      console.error('Failed to create stream:', error);
      alert('Failed to create stream: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const stopStream = async (streamId, streamType) => {
    try {
      // Implementation depends on stream type
      console.log('Stopping stream:', streamId, streamType);
      // This would call the appropriate API endpoint to stop the stream
      await loadStreams();
    } catch (error) {
      console.error('Failed to stop stream:', error);
      alert('Failed to stop stream: ' + error.message);
    }
  };

  const restartStream = async (streamId, streamType) => {
    try {
      console.log('Restarting stream:', streamId, streamType);
      // This would call the appropriate API endpoint to restart the stream
      await loadStreams();
    } catch (error) {
      console.error('Failed to restart stream:', error);
      alert('Failed to restart stream: ' + error.message);
    }
  };

  const getStreamStatus = (stream) => {
    if (stream.type === 'RTMP') {
      return stream.duration > 0 ? 'active' : 'stopped';
    } else if (stream.type === 'WebSocket') {
      return stream.stats?.isStreamActive ? 'active' : 'stopped';
    }
    return 'unknown';
  };

  const formatDuration = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <ManagerContainer>
      <Title>Stream Manager</Title>

      <StatsGrid>
        <StatCard>
          <StatValue>{streams.length}</StatValue>
          <StatLabel>Active Streams</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{systemStats.cpuUsage || 0}%</StatValue>
          <StatLabel>CPU Usage</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{systemStats.memoryUsage || 0}%</StatValue>
          <StatLabel>Memory Usage</StatLabel>
        </StatCard>
        <StatCard>
          <StatValue>{formatBytes(systemStats.networkBandwidth)}</StatValue>
          <StatLabel>Network Usage</StatLabel>
        </StatCard>
      </StatsGrid>

      <ControlsPanel>
        <h3>Create New Stream</h3>
        <InputGroup>
          <Input
            type="text"
            placeholder="Enter source URL (RTMP, file, or camera)"
            value={newStreamUrl}
            onChange={(e) => setNewStreamUrl(e.target.value)}
          />
          <Select
            value={newStreamType}
            onChange={(e) => setNewStreamType(e.target.value)}
          >
            <option value="hls">HLS Stream</option>
            <option value="dash">DASH Stream</option>
          </Select>
          <Button onClick={createStream} disabled={loading || !newStreamUrl.trim()}>
            {loading ? 'Creating...' : 'Create Stream'}
          </Button>
        </InputGroup>
      </ControlsPanel>

      <StreamsList>
        <h3>Active Streams</h3>
        {streams.length === 0 ? (
          <p>No active streams</p>
        ) : (
          streams.map((stream, index) => (
            <StreamItem key={stream.id || index}>
              <StreamInfo>
                <StreamTitle>
                  <StatusIndicator status={getStreamStatus(stream)} />
                  {stream.type} Stream - {stream.id || stream.socketId}
                </StreamTitle>
                <StreamDetails>
                  {stream.type === 'RTMP' && (
                    <>
                      <div>Stream Key: {stream.streamKey}</div>
                      <div>Duration: {formatDuration(stream.duration)}</div>
                      <div>Started: {new Date(stream.startTime).toLocaleTimeString()}</div>
                    </>
                  )}
                  {stream.type === 'WebSocket' && stream.stats && (
                    <>
                      <div>FPS: {stream.stats.fps}</div>
                      <div>Frames: {stream.stats.frameCount}</div>
                      <div>Duration: {formatDuration(stream.stats.duration)}</div>
                      <div>Buffer: {stream.stats.bufferSize}</div>
                    </>
                  )}
                </StreamDetails>
              </StreamInfo>
              <StreamActions>
                <Button
                  variant="danger"
                  onClick={() => stopStream(stream.id || stream.socketId, stream.type)}
                >
                  Stop
                </Button>
                <Button
                  onClick={() => restartStream(stream.id || stream.socketId, stream.type)}
                >
                  Restart
                </Button>
              </StreamActions>
            </StreamItem>
          ))
        )}
      </StreamsList>

      <RefreshButton onClick={loadStreams}>
        🔄
      </RefreshButton>
    </ManagerContainer>
  );
}

export default StreamManager;