class WebSocketHandler {
  constructor() {
    this.activeConnections = new Map();
    this.frameBuffers = new Map();
  }

  handleConnection(socket, io) {
    this.activeConnections.set(socket.id, {
      socket,
      startTime: Date.now(),
      frameCount: 0
    });

    socket.on('video-frame', (data) => {
      this.handleVideoFrame(socket.id, data);
    });

    socket.on('start-stream', (config) => {
      this.startFrameStream(socket.id, config);
    });

    socket.on('stop-stream', () => {
      this.stopFrameStream(socket.id);
    });

    socket.on('configure-processing', (config) => {
      this.configureProcessing(socket.id, config);
    });

    socket.on('get-stream-stats', (callback) => {
      const stats = this.getStreamStats(socket.id);
      callback(stats);
    });

    console.log(`[WebSocket] Client ${socket.id} connected for frame streaming`);
  }

  handleVideoFrame(socketId, frameData) {
    const connection = this.activeConnections.get(socketId);
    if (!connection) {
      console.warn(`[WebSocket] No connection found for ${socketId}`);
      return;
    }

    connection.frameCount++;
    connection.lastFrameTime = Date.now();

    if (!this.frameBuffers.has(socketId)) {
      this.frameBuffers.set(socketId, []);
    }

    const buffer = this.frameBuffers.get(socketId);
    buffer.push({
      data: frameData,
      timestamp: Date.now(),
      sequence: connection.frameCount
    });

    if (buffer.length > 30) {
      buffer.shift();
    }

    this.processFrame(socketId, frameData);
  }

  processFrame(socketId, frameData) {
    try {
      const processedFrame = this.applyFrameProcessing(frameData);

      global.videoProcessor?.processWebSocketFrame(socketId, processedFrame);

      const connection = this.activeConnections.get(socketId);
      if (connection) {
        connection.socket.emit('processed-frame', processedFrame);
      }
    } catch (error) {
      console.error(`[WebSocket] Frame processing error for ${socketId}:`, error);
    }
  }

  applyFrameProcessing(frameData) {
    if (!frameData || !frameData.data) {
      return frameData;
    }

    return {
      ...frameData,
      data: frameData.data,
      processed: true,
      timestamp: Date.now()
    };
  }

  startFrameStream(socketId, config) {
    const connection = this.activeConnections.get(socketId);
    if (!connection) return;

    connection.streamConfig = {
      ...config,
      active: true,
      startTime: Date.now()
    };

    connection.socket.emit('stream-started', {
      success: true,
      config: connection.streamConfig
    });

    console.log(`[WebSocket] Frame stream started for ${socketId}`);
  }

  stopFrameStream(socketId) {
    const connection = this.activeConnections.get(socketId);
    if (!connection) return;

    if (connection.streamConfig) {
      connection.streamConfig.active = false;
      connection.streamConfig.endTime = Date.now();
    }

    this.frameBuffers.delete(socketId);

    connection.socket.emit('stream-stopped', {
      success: true,
      stats: this.getStreamStats(socketId)
    });

    console.log(`[WebSocket] Frame stream stopped for ${socketId}`);
  }

  configureProcessing(socketId, config) {
    const connection = this.activeConnections.get(socketId);
    if (!connection) return;

    connection.processingConfig = config;

    global.videoProcessor?.updateProcessingConfig(socketId, config);

    connection.socket.emit('processing-configured', {
      success: true,
      config
    });
  }

  getStreamStats(socketId) {
    const connection = this.activeConnections.get(socketId);
    if (!connection) return null;

    const currentTime = Date.now();
    const duration = currentTime - connection.startTime;
    const fps = connection.frameCount / (duration / 1000);

    return {
      socketId,
      duration,
      frameCount: connection.frameCount,
      fps: Math.round(fps * 100) / 100,
      lastFrameTime: connection.lastFrameTime,
      bufferSize: this.frameBuffers.get(socketId)?.length || 0,
      isStreamActive: connection.streamConfig?.active || false
    };
  }

  broadcastToRoom(room, event, data) {
    for (const [socketId, connection] of this.activeConnections) {
      if (connection.room === room) {
        connection.socket.emit(event, data);
      }
    }
  }

  getActiveConnections() {
    return Array.from(this.activeConnections.keys()).map(socketId => ({
      socketId,
      stats: this.getStreamStats(socketId)
    }));
  }

  handleDisconnection(socketId) {
    this.frameBuffers.delete(socketId);
    this.activeConnections.delete(socketId);
    console.log(`[WebSocket] Client ${socketId} disconnected`);
  }
}

module.exports = new WebSocketHandler();