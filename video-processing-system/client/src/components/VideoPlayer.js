import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import Hls from 'hls.js';
import dashjs from 'dashjs';

const PlayerContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h2`
  text-align: center;
  margin-bottom: 2rem;
  font-size: 2rem;
`;

const PlayerGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const VideoPanel = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
`;

const VideoContainer = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  background: black;
  border-radius: 0.5rem;
  overflow: hidden;
  margin-bottom: 1rem;
`;

const Video = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

const ControlsPanel = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
`;

const InputGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
`;

const Input = styled.input`
  width: 100%;
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
  width: 100%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
`;

const Button = styled.button`
  width: 100%;
  background: ${props => {
    if (props.variant === 'danger') return 'linear-gradient(135deg, #ef4444, #dc2626)';
    return 'linear-gradient(135deg, #3b82f6, #2563eb)';
  }};
  color: white;
  border: none;
  padding: 0.75rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s ease;
  margin-bottom: 1rem;

  &:hover {
    transform: translateY(-2px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const QualitySelector = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const QualityButton = styled.button`
  padding: 0.5rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: ${props => props.active ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255, 255, 255, 0.1)'};
  color: white;
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.9rem;

  &:hover {
    background: rgba(59, 130, 246, 0.3);
  }
`;

const InfoPanel = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-top: 1rem;
  font-family: monospace;
  font-size: 0.9rem;
`;

const ErrorMessage = styled.div`
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid #ef4444;
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 1rem 0;
  color: #fecaca;
`;

function VideoPlayer() {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const dashPlayerRef = useRef(null);

  const [streamUrl, setStreamUrl] = useState('');
  const [streamType, setStreamType] = useState('hls');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQuality, setCurrentQuality] = useState('auto');
  const [availableQualities, setAvailableQualities] = useState([]);
  const [playerInfo, setPlayerInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashPlayerRef.current) {
      dashPlayerRef.current.destroy();
      dashPlayerRef.current = null;
    }
    setError(null);
    setPlayerInfo(null);
    setAvailableQualities([]);
  };

  const loadStream = async () => {
    if (!streamUrl.trim()) {
      setError('Please enter a stream URL');
      return;
    }

    cleanup();
    setError(null);

    try {
      if (streamType === 'hls') {
        await loadHLSStream();
      } else if (streamType === 'dash') {
        await loadDASHStream();
      } else if (streamType === 'webrtc') {
        await loadWebRTCStream();
      } else {
        // Direct video URL
        loadDirectVideo();
      }
    } catch (err) {
      setError(`Failed to load ${streamType.toUpperCase()} stream: ${err.message}`);
      console.error('Stream loading error:', err);
    }
  };

  const loadHLSStream = async () => {
    if (!Hls.isSupported()) {
      throw new Error('HLS is not supported in this browser');
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90
    });

    hls.loadSource(streamUrl);
    hls.attachMedia(videoRef.current);

    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log('HLS manifest parsed', data);

      const qualities = data.levels.map((level, index) => ({
        index,
        height: level.height,
        bitrate: level.bitrate,
        name: `${level.height}p`
      }));

      setAvailableQualities([{ index: -1, name: 'Auto' }, ...qualities]);

      setPlayerInfo({
        type: 'HLS',
        levels: data.levels.length,
        duration: data.totalduration || 'Live'
      });
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      const level = hls.levels[data.level];
      console.log('Quality switched to:', level);

      setPlayerInfo(prev => ({
        ...prev,
        currentLevel: `${level.height}p (${Math.round(level.bitrate / 1000)}k)`
      }));
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS error:', data);
      if (data.fatal) {
        setError(`HLS Error: ${data.type} - ${data.details}`);
      }
    });

    hlsRef.current = hls;
  };

  const loadDASHStream = async () => {
    const player = dashjs.MediaPlayer().create();

    player.initialize(videoRef.current, streamUrl, false);

    player.getDebug().setLogToBrowserConsole(true);

    player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
      const bitrateInfoList = player.getBitrateInfoListFor('video');

      const qualities = bitrateInfoList.map((info, index) => ({
        index,
        height: info.height,
        bitrate: info.bitrate,
        name: `${info.height}p`
      }));

      setAvailableQualities([{ index: -1, name: 'Auto' }, ...qualities]);

      setPlayerInfo({
        type: 'DASH',
        qualities: qualities.length,
        duration: player.duration() || 'Live'
      });
    });

    player.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, (e) => {
      const bitrate = e.newQuality;
      console.log('DASH quality changed to:', bitrate);

      setPlayerInfo(prev => ({
        ...prev,
        currentQuality: `${bitrate.height}p (${Math.round(bitrate.bitrate / 1000)}k)`
      }));
    });

    player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
      console.error('DASH error:', e);
      setError(`DASH Error: ${e.error}`);
    });

    dashPlayerRef.current = player;
  };

  const loadWebRTCStream = async () => {
    // WebRTC implementation would go here
    // This would integrate with the WebRTC service
    setError('WebRTC playback not yet implemented');
  };

  const loadDirectVideo = () => {
    videoRef.current.src = streamUrl;
    setPlayerInfo({
      type: 'Direct Video',
      src: streamUrl
    });
  };

  const changeQuality = (qualityIndex) => {
    setCurrentQuality(qualityIndex);

    if (streamType === 'hls' && hlsRef.current) {
      if (qualityIndex === -1) {
        hlsRef.current.currentLevel = -1; // Auto
      } else {
        hlsRef.current.currentLevel = qualityIndex;
      }
    } else if (streamType === 'dash' && dashPlayerRef.current) {
      if (qualityIndex === -1) {
        dashPlayerRef.current.setAutoSwitchQualityFor('video', true);
      } else {
        dashPlayerRef.current.setAutoSwitchQualityFor('video', false);
        dashPlayerRef.current.setQualityFor('video', qualityIndex);
      }
    }
  };

  const handlePlay = () => {
    videoRef.current?.play();
    setIsPlaying(true);
  };

  const handlePause = () => {
    videoRef.current?.pause();
    setIsPlaying(false);
  };

  const handleStop = () => {
    cleanup();
    if (videoRef.current) {
      videoRef.current.src = '';
    }
    setIsPlaying(false);
  };

  const getExampleUrls = () => {
    const baseUrl = window.location.origin;
    return {
      hls: `${baseUrl}/hls/stream1/playlist.m3u8`,
      dash: `${baseUrl}/dash/stream1/manifest.mpd`,
      webrtc: 'webrtc://localhost:3001/stream1'
    };
  };

  const loadExampleStream = () => {
    const examples = getExampleUrls();
    setStreamUrl(examples[streamType]);
  };

  return (
    <PlayerContainer>
      <Title>Video Player</Title>

      <PlayerGrid>
        <VideoPanel>
          <VideoContainer>
            <Video
              ref={videoRef}
              controls
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={(e) => setError(`Video error: ${e.target.error?.message || 'Unknown error'}`)}
            />
          </VideoContainer>

          {availableQualities.length > 0 && (
            <div>
              <Label>Quality:</Label>
              <QualitySelector>
                {availableQualities.map((quality) => (
                  <QualityButton
                    key={quality.index}
                    active={currentQuality === quality.index}
                    onClick={() => changeQuality(quality.index)}
                  >
                    {quality.name}
                  </QualityButton>
                ))}
              </QualitySelector>
            </div>
          )}
        </VideoPanel>

        <ControlsPanel>
          <InputGroup>
            <Label>Stream Type:</Label>
            <Select
              value={streamType}
              onChange={(e) => setStreamType(e.target.value)}
            >
              <option value="hls">HLS</option>
              <option value="dash">DASH</option>
              <option value="webrtc">WebRTC</option>
              <option value="direct">Direct Video</option>
            </Select>
          </InputGroup>

          <InputGroup>
            <Label>Stream URL:</Label>
            <Input
              type="text"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder={`Enter ${streamType.toUpperCase()} stream URL...`}
            />
          </InputGroup>

          <Button onClick={loadExampleStream}>
            Load Example {streamType.toUpperCase()}
          </Button>

          <Button onClick={loadStream}>
            Load Stream
          </Button>

          <Button onClick={handlePlay} disabled={!streamUrl || isPlaying}>
            Play
          </Button>

          <Button onClick={handlePause} disabled={!isPlaying}>
            Pause
          </Button>

          <Button onClick={handleStop} variant="danger">
            Stop
          </Button>

          {error && (
            <ErrorMessage>
              {error}
            </ErrorMessage>
          )}

          {playerInfo && (
            <InfoPanel>
              <h4>Player Info</h4>
              <div>Type: {playerInfo.type}</div>
              {playerInfo.levels && <div>Levels: {playerInfo.levels}</div>}
              {playerInfo.qualities && <div>Qualities: {playerInfo.qualities}</div>}
              {playerInfo.duration && <div>Duration: {playerInfo.duration}</div>}
              {playerInfo.currentLevel && <div>Current: {playerInfo.currentLevel}</div>}
              {playerInfo.currentQuality && <div>Current: {playerInfo.currentQuality}</div>}
              {playerInfo.src && <div>Source: {playerInfo.src}</div>}
            </InfoPanel>
          )}
        </ControlsPanel>
      </PlayerGrid>
    </PlayerContainer>
  );
}

export default VideoPlayer;