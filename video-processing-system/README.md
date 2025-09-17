# Real-Time Video Processing System

## Architecture Overview

```
Client → Backend API → Video Processing Engine → Modified Video Stream → Client
```

### Components:

1. **Backend API Server** (Node.js/Express)
   - RTMP/WebRTC input handling
   - WebSocket for direct frame streaming
   - REST API for control and management

2. **Video Processing Engine** (Python/C++)
   - GPU-accelerated pipeline (GStreamer/FFmpeg)
   - ML inference integration
   - Real-time frame processing

3. **Output Streaming**
   - WebRTC (low latency ~100ms)
   - HLS/DASH (higher latency ~3-10s)

4. **Client Components**
   - Video upload interface
   - Real-time playback
   - Configuration controls

## Data Flow

1. **Input Sources:**
   - RTMP stream ingestion
   - WebRTC peer connection
   - WebSocket frame streaming

2. **Processing Pipeline:**
   - Frame extraction
   - GPU-accelerated effects/ML
   - Frame reconstruction

3. **Output Delivery:**
   - WebRTC for real-time
   - HLS/DASH for scalable streaming

## Technology Stack

- **Backend:** Node.js, Express, Socket.io
- **Processing:** Python, OpenCV, GStreamer, FFmpeg
- **Streaming:** mediasoup (WebRTC), nginx-rtmp
- **Frontend:** React, WebRTC APIs
- **Infrastructure:** Docker, Redis (session management)