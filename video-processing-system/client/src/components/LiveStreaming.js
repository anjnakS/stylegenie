import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import Webcam from 'react-webcam';
import { useSocket } from '../services/socketService';
import WebRTCService from '../services/webrtcService';

const StreamingContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h2`
  text-align: center;
  margin-bottom: 2rem;
  font-size: 2rem;
`;

const StreamingGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-bottom: 2rem;

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
  height: 300px;
  background: black;
  border-radius: 0.5rem;
  overflow: hidden;
  margin-bottom: 1rem;
`;

const Video = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const WebcamWrapper = styled(Webcam)`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const StatusOverlay = styled.div`
  position: absolute;
  top: 1rem;
  left: 1rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  font-size: 0.9rem;
`;

const ControlsPanel = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const Button = styled.button`
  background: ${props => {
    if (props.variant === 'danger') return 'linear-gradient(135deg, #ef4444, #dc2626)';
    if (props.variant === 'success') return 'linear-gradient(135deg, #22c55e, #16a34a)';
    return 'linear-gradient(135deg, #3b82f6, #2563eb)';
  }};
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-2px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const EffectsPanel = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
`;

const EffectControl = styled.div`
  margin-bottom: 1rem;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
`;

const Checkbox = styled.input`
  margin-right: 0.5rem;
`;

const Slider = styled.input`
  width: 100%;
  margin: 0.5rem 0;
`;

const StreamStats = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-top: 1rem;
  font-family: monospace;
  font-size: 0.9rem;
`;

function LiveStreaming() {
  const { socket, connected } = useSocket();
  const webcamRef = useRef(null);
  const processedVideoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamType, setStreamType] = useState('webcam'); // 'webcam', 'screen', 'webrtc'
  const [webrtcService, setWebrtcService] = useState(null);
  const [streamStats, setStreamStats] = useState(null);
  const [effects, setEffects] = useState({
    blur: { enabled: false, intensity: 15 },
    edgeDetection: { enabled: false },
    colorFilter: { enabled: false, hueShift: 0 },
    mlEnhancement: { enabled: false }
  });

  useEffect(() => {
    if (socket && connected) {
      const webrtc = new WebRTCService(socket);
      setWebrtcService(webrtc);

      socket.on('processed-frame', handleProcessedFrame);
      socket.on('stream-started', handleStreamStarted);
      socket.on('stream-stopped', handleStreamStopped);

      return () => {
        socket.off('processed-frame', handleProcessedFrame);
        socket.off('stream-started', handleStreamStarted);
        socket.off('stream-stopped', handleStreamStopped);
        webrtc?.cleanup();
      };
    }
  }, [socket, connected]);

  useEffect(() => {
    if (isStreaming) {
      const interval = setInterval(updateStreamStats, 2000);
      return () => clearInterval(interval);
    }
  }, [isStreaming]);

  const handleProcessedFrame = (frameData) => {
    if (processedVideoRef.current && frameData.data) {
      // Convert frame data to video element source
      const blob = new Blob([frameData.data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      processedVideoRef.current.src = url;
    }
  };

  const handleStreamStarted = (response) => {
    console.log('Stream started:', response);
    setIsStreaming(true);
  };

  const handleStreamStopped = (response) => {
    console.log('Stream stopped:', response);
    setIsStreaming(false);
    setStreamStats(response.stats);
  };

  const startWebcamStream = async () => {
    try {
      if (streamType === 'webrtc' && webrtcService) {
        await webrtcService.startWebcamStream();
        setIsStreaming(true);
      } else {
        // Start WebSocket frame streaming
        const config = {
          type: 'webcam',
          effects: effects,
          quality: 'high'
        };

        await socket.emit('start-stream', config);
        startFrameCapture();
      }
    } catch (error) {
      console.error('Failed to start webcam stream:', error);
      alert('Failed to start webcam stream: ' + error.message);
    }
  };

  const startScreenShare = async () => {
    try {
      if (webrtcService) {
        await webrtcService.startScreenShare();
        setIsStreaming(true);
      }
    } catch (error) {
      console.error('Failed to start screen share:', error);
      alert('Failed to start screen share: ' + error.message);
    }
  };

  const stopStream = async () => {
    try {
      if (webrtcService) {
        await webrtcService.stopProducing();
      }

      if (socket) {
        socket.emit('stop-stream');
      }

      setIsStreaming(false);

      if (frameInterval) {
        clearInterval(frameInterval);
        frameInterval = null;
      }
    } catch (error) {
      console.error('Failed to stop stream:', error);
    }
  };

  let frameInterval = null;

  const startFrameCapture = () => {
    if (!webcamRef.current || frameInterval) return;

    frameInterval = setInterval(() => {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc && socket) {
        // Convert base64 to binary data
        const binaryData = atob(imageSrc.split(',')[1]);
        const array = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
          array[i] = binaryData.charCodeAt(i);
        }

        socket.emit('video-frame', {
          data: Array.from(array),
          timestamp: Date.now(),
          format: 'jpeg'
        });
      }
    }, 1000 / 30); // 30 FPS
  };

  const updateStreamStats = async () => {
    try {
      if (socket) {
        const stats = await socket.emit('get-stream-stats', (response) => {
          setStreamStats(response);
        });
      }
    } catch (error) {
      console.error('Failed to get stream stats:', error);
    }
  };

  const updateEffects = () => {
    if (socket && connected) {
      socket.emit('configure-processing', effects);
    }
  };

  const toggleEffect = (effectName, enabled) => {
    setEffects(prev => ({
      ...prev,
      [effectName]: {
        ...prev[effectName],
        enabled
      }
    }));
  };

  const updateEffectValue = (effectName, key, value) => {
    setEffects(prev => ({
      ...prev,
      [effectName]: {
        ...prev[effectName],
        [key]: value
      }
    }));
  };

  useEffect(() => {
    updateEffects();
  }, [effects]);

  return (
    <StreamingContainer>
      <Title>Live Video Streaming</Title>

      <StreamingGrid>
        <VideoPanel>
          <h3>Input Video</h3>
          <VideoContainer>
            {streamType === 'webcam' && (
              <WebcamWrapper
                ref={webcamRef}
                audio={true}
                width="100%"
                height="100%"
                screenshotFormat="image/jpeg"
                videoConstraints={{
                  width: 1280,
                  height: 720,
                  facingMode: 'user'
                }}
              />
            )}
            <StatusOverlay>
              {connected ? (isStreaming ? 'LIVE' : 'READY') : 'DISCONNECTED'}
            </StatusOverlay>
          </VideoContainer>
        </VideoPanel>

        <VideoPanel>
          <h3>Processed Output</h3>
          <VideoContainer>
            <Video ref={processedVideoRef} autoPlay muted />
            <StatusOverlay>
              {isStreaming ? 'PROCESSING' : 'WAITING'}
            </StatusOverlay>
          </VideoContainer>
        </VideoPanel>
      </StreamingGrid>

      <ControlsPanel>
        <h3>Stream Controls</h3>

        <ButtonGroup>
          <Button
            onClick={() => setStreamType('webcam')}
            variant={streamType === 'webcam' ? 'success' : 'primary'}
          >
            Webcam
          </Button>
          <Button
            onClick={() => setStreamType('webrtc')}
            variant={streamType === 'webrtc' ? 'success' : 'primary'}
          >
            WebRTC
          </Button>
        </ButtonGroup>

        <ButtonGroup>
          <Button
            onClick={startWebcamStream}
            disabled={isStreaming || !connected}
            variant="success"
          >
            Start Webcam
          </Button>
          <Button
            onClick={startScreenShare}
            disabled={isStreaming || !connected || streamType !== 'webrtc'}
            variant="success"
          >
            Start Screen Share
          </Button>
          <Button
            onClick={stopStream}
            disabled={!isStreaming}
            variant="danger"
          >
            Stop Stream
          </Button>
        </ButtonGroup>
      </ControlsPanel>

      <EffectsPanel>
        <h3>Real-time Effects</h3>

        <EffectControl>
          <Label>
            <Checkbox
              type="checkbox"
              checked={effects.blur.enabled}
              onChange={(e) => toggleEffect('blur', e.target.checked)}
            />
            Blur Effect
          </Label>
          {effects.blur.enabled && (
            <div>
              <Label>Intensity: {effects.blur.intensity}</Label>
              <Slider
                type="range"
                min="5"
                max="51"
                step="2"
                value={effects.blur.intensity}
                onChange={(e) => updateEffectValue('blur', 'intensity', parseInt(e.target.value))}
              />
            </div>
          )}
        </EffectControl>

        <EffectControl>
          <Label>
            <Checkbox
              type="checkbox"
              checked={effects.edgeDetection.enabled}
              onChange={(e) => toggleEffect('edgeDetection', e.target.checked)}
            />
            Edge Detection
          </Label>
        </EffectControl>

        <EffectControl>
          <Label>
            <Checkbox
              type="checkbox"
              checked={effects.colorFilter.enabled}
              onChange={(e) => toggleEffect('colorFilter', e.target.checked)}
            />
            Color Filter
          </Label>
          {effects.colorFilter.enabled && (
            <div>
              <Label>Hue Shift: {effects.colorFilter.hueShift}</Label>
              <Slider
                type="range"
                min="-180"
                max="180"
                value={effects.colorFilter.hueShift}
                onChange={(e) => updateEffectValue('colorFilter', 'hueShift', parseInt(e.target.value))}
              />
            </div>
          )}
        </EffectControl>

        <EffectControl>
          <Label>
            <Checkbox
              type="checkbox"
              checked={effects.mlEnhancement.enabled}
              onChange={(e) => toggleEffect('mlEnhancement', e.target.checked)}
            />
            ML Enhancement
          </Label>
        </EffectControl>
      </EffectsPanel>

      {streamStats && (
        <StreamStats>
          <h4>Stream Statistics</h4>
          <div>Duration: {Math.round(streamStats.duration / 1000)}s</div>
          <div>Frame Count: {streamStats.frameCount}</div>
          <div>FPS: {streamStats.fps}</div>
          <div>Buffer Size: {streamStats.bufferSize}</div>
          <div>Active: {streamStats.isStreamActive ? 'Yes' : 'No'}</div>
        </StreamStats>
      )}
    </StreamingContainer>
  );
}

export default LiveStreaming;