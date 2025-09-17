const NodeRtmpServer = require('node-rtmp-server');
const { spawn } = require('child_process');
const path = require('path');

class RTMPHandler {
  constructor() {
    this.rtmpServer = null;
    this.activeStreams = new Map();
  }

  init() {
    this.rtmpServer = new NodeRtmpServer({
      port: process.env.RTMP_PORT || 1935,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60
    });

    this.rtmpServer.on('preConnect', (id, args) => {
      console.log('[RTMP] PreConnect', id, args);
    });

    this.rtmpServer.on('postConnect', (id, args) => {
      console.log('[RTMP] PostConnect', id, args);
    });

    this.rtmpServer.on('prePublish', (id, StreamPath, args) => {
      console.log('[RTMP] PrePublish', id, StreamPath, args);

      const streamKey = StreamPath.split('/').pop();
      if (!this.validateStreamKey(streamKey)) {
        console.log('[RTMP] Invalid stream key:', streamKey);
        return false;
      }

      this.startVideoProcessing(id, streamKey);
      return true;
    });

    this.rtmpServer.on('postPublish', (id, StreamPath, args) => {
      console.log('[RTMP] PostPublish', id, StreamPath);
    });

    this.rtmpServer.on('donePublish', (id, StreamPath, args) => {
      console.log('[RTMP] DonePublish', id, StreamPath);
      this.stopVideoProcessing(id);
    });

    this.rtmpServer.run();
    console.log(`RTMP Server started on port ${process.env.RTMP_PORT || 1935}`);
  }

  validateStreamKey(streamKey) {
    return streamKey && streamKey.length > 0;
  }

  startVideoProcessing(streamId, streamKey) {
    const inputUrl = `rtmp://localhost:${process.env.RTMP_PORT || 1935}/live/${streamKey}`;
    const outputPath = path.join(process.cwd(), 'temp', `${streamId}_processed`);

    const ffmpegArgs = [
      '-i', inputUrl,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-f', 'flv',
      '-'
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    ffmpegProcess.stdout.on('data', (data) => {
      this.sendToProcessingEngine(streamId, data);
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.log(`[RTMP] FFmpeg stderr: ${data}`);
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`[RTMP] FFmpeg process closed with code ${code}`);
      this.activeStreams.delete(streamId);
    });

    this.activeStreams.set(streamId, {
      process: ffmpegProcess,
      streamKey,
      startTime: Date.now()
    });
  }

  stopVideoProcessing(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream && stream.process) {
      stream.process.kill('SIGTERM');
      this.activeStreams.delete(streamId);
    }
  }

  sendToProcessingEngine(streamId, data) {
    global.videoProcessor?.processRTMPData(streamId, data);
  }

  getActiveStreams() {
    return Array.from(this.activeStreams.entries()).map(([id, stream]) => ({
      id,
      streamKey: stream.streamKey,
      startTime: stream.startTime,
      duration: Date.now() - stream.startTime
    }));
  }
}

module.exports = new RTMPHandler();