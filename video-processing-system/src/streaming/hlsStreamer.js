const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class HLSStreamer {
  constructor() {
    this.activeStreams = new Map();
    this.outputDir = process.env.HLS_OUTPUT_DIR || 'output/hls';
    this.segmentDuration = parseInt(process.env.HLS_SEGMENT_DURATION) || 6;
    this.listSize = parseInt(process.env.HLS_LIST_SIZE) || 10;
  }

  async startStream(streamId, inputSource, options = {}) {
    if (this.activeStreams.has(streamId)) {
      throw new Error(`HLS stream ${streamId} already exists`);
    }

    const outputPath = path.join(this.outputDir, streamId);
    await this.ensureDirectoryExists(outputPath);

    const streamConfig = {
      streamId,
      inputSource,
      outputPath,
      startTime: Date.now(),
      options: {
        resolution: options.resolution || '1920x1080',
        bitrate: options.bitrate || '2000k',
        framerate: options.framerate || 30,
        keyframeInterval: options.keyframeInterval || 60,
        ...options
      }
    };

    try {
      const ffmpegProcess = this.createFFmpegProcess(streamConfig);
      streamConfig.process = ffmpegProcess;

      this.activeStreams.set(streamId, streamConfig);

      await this.setupEventHandlers(streamConfig);

      console.log(`[HLS] Started stream ${streamId}`);
      return {
        streamId,
        playlistUrl: `${this.getBaseUrl()}/${streamId}/playlist.m3u8`,
        outputPath
      };
    } catch (error) {
      await this.cleanup(streamId);
      throw error;
    }
  }

  createFFmpegProcess(config) {
    const { inputSource, outputPath, options } = config;

    const ffmpegArgs = [
      '-i', inputSource,

      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-maxrate', options.bitrate,
      '-bufsize', `${parseInt(options.bitrate) * 2}k`,
      '-s', options.resolution,
      '-r', options.framerate.toString(),
      '-g', options.keyframeInterval.toString(),

      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',

      '-f', 'hls',
      '-hls_time', this.segmentDuration.toString(),
      '-hls_list_size', this.listSize.toString(),
      '-hls_wrap', (this.listSize * 2).toString(),
      '-hls_delete_threshold', '1',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', path.join(outputPath, 'segment_%03d.ts'),

      path.join(outputPath, 'playlist.m3u8')
    ];

    return spawn('ffmpeg', ffmpegArgs);
  }

  async setupEventHandlers(config) {
    const { streamId, process } = config;

    process.stdout.on('data', (data) => {
      console.log(`[HLS:${streamId}] stdout: ${data}`);
    });

    process.stderr.on('data', (data) => {
      console.log(`[HLS:${streamId}] stderr: ${data}`);
    });

    process.on('close', (code) => {
      console.log(`[HLS:${streamId}] Process closed with code ${code}`);
      this.activeStreams.delete(streamId);
    });

    process.on('error', (error) => {
      console.error(`[HLS:${streamId}] Process error:`, error);
      this.activeStreams.delete(streamId);
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('HLS stream setup timeout'));
      }, 10000);

      const checkPlaylist = () => {
        const playlistPath = path.join(config.outputPath, 'playlist.m3u8');
        if (fs.existsSync(playlistPath)) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkPlaylist, 1000);
        }
      };

      checkPlaylist();
    });
  }

  async stopStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error(`HLS stream ${streamId} not found`);
    }

    try {
      if (stream.process) {
        stream.process.kill('SIGTERM');

        setTimeout(() => {
          if (stream.process && !stream.process.killed) {
            stream.process.kill('SIGKILL');
          }
        }, 5000);
      }

      this.activeStreams.delete(streamId);
      console.log(`[HLS] Stopped stream ${streamId}`);

      return {
        streamId,
        duration: Date.now() - stream.startTime
      };
    } catch (error) {
      console.error(`[HLS] Error stopping stream ${streamId}:`, error);
      throw error;
    }
  }

  async createAdaptiveStream(streamId, inputSource, qualities = []) {
    if (qualities.length === 0) {
      qualities = [
        { name: '720p', resolution: '1280x720', bitrate: '1500k' },
        { name: '480p', resolution: '854x480', bitrate: '800k' },
        { name: '360p', resolution: '640x360', bitrate: '400k' }
      ];
    }

    const outputPath = path.join(this.outputDir, streamId);
    await this.ensureDirectoryExists(outputPath);

    const variantPlaylists = [];
    const processes = [];

    for (const quality of qualities) {
      const qualityPath = path.join(outputPath, quality.name);
      await this.ensureDirectoryExists(qualityPath);

      const ffmpegArgs = [
        '-i', inputSource,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-maxrate', quality.bitrate,
        '-bufsize', `${parseInt(quality.bitrate) * 2}k`,
        '-s', quality.resolution,
        '-r', '30',
        '-g', '60',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', this.segmentDuration.toString(),
        '-hls_list_size', this.listSize.toString(),
        '-hls_segment_filename', path.join(qualityPath, 'segment_%03d.ts'),
        path.join(qualityPath, 'playlist.m3u8')
      ];

      const process = spawn('ffmpeg', ffmpegArgs);
      processes.push({ quality, process });

      variantPlaylists.push({
        uri: `${quality.name}/playlist.m3u8`,
        bandwidth: this.calculateBandwidth(quality.bitrate),
        resolution: quality.resolution,
        name: quality.name
      });
    }

    await this.createMasterPlaylist(outputPath, variantPlaylists);

    this.activeStreams.set(streamId, {
      streamId,
      type: 'adaptive',
      processes,
      outputPath,
      startTime: Date.now(),
      qualities
    });

    return {
      streamId,
      type: 'adaptive',
      masterPlaylistUrl: `${this.getBaseUrl()}/${streamId}/master.m3u8`,
      qualities: variantPlaylists
    };
  }

  async createMasterPlaylist(outputPath, variants) {
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

    for (const variant of variants) {
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.resolution},NAME="${variant.name}"\n`;
      content += `${variant.uri}\n\n`;
    }

    const masterPlaylistPath = path.join(outputPath, 'master.m3u8');
    await fs.promises.writeFile(masterPlaylistPath, content);
  }

  calculateBandwidth(bitrate) {
    const numericBitrate = parseInt(bitrate.replace(/[^0-9]/g, ''));
    return numericBitrate * 1000 + 128000; // Video bitrate + audio bitrate
  }

  getStreamStats(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      return null;
    }

    const stats = {
      streamId,
      type: stream.type || 'single',
      status: 'active',
      duration: Date.now() - stream.startTime,
      outputPath: stream.outputPath
    };

    if (stream.type === 'adaptive') {
      stats.qualities = stream.qualities;
      stats.processCount = stream.processes.length;
    }

    return stats;
  }

  getAllStreams() {
    return Array.from(this.activeStreams.keys()).map(streamId =>
      this.getStreamStats(streamId)
    );
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.promises.access(dirPath);
    } catch {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  getBaseUrl() {
    return process.env.HLS_BASE_URL || `http://localhost:${process.env.PORT || 3001}/hls`;
  }

  async cleanup(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      if (stream.processes) {
        stream.processes.forEach(({ process }) => {
          if (process && !process.killed) {
            process.kill('SIGTERM');
          }
        });
      } else if (stream.process && !stream.process.killed) {
        stream.process.kill('SIGTERM');
      }

      this.activeStreams.delete(streamId);
    }
  }

  async shutdown() {
    console.log('[HLS] Shutting down all streams...');

    const shutdownPromises = Array.from(this.activeStreams.keys()).map(streamId =>
      this.stopStream(streamId).catch(console.error)
    );

    await Promise.all(shutdownPromises);
  }
}

module.exports = HLSStreamer;