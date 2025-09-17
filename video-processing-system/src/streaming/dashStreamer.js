const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class DASHStreamer {
  constructor() {
    this.activeStreams = new Map();
    this.outputDir = process.env.DASH_OUTPUT_DIR || 'output/dash';
    this.segmentDuration = parseInt(process.env.DASH_SEGMENT_DURATION) || 4;
    this.windowSize = parseInt(process.env.DASH_WINDOW_SIZE) || 5;
  }

  async startStream(streamId, inputSource, options = {}) {
    if (this.activeStreams.has(streamId)) {
      throw new Error(`DASH stream ${streamId} already exists`);
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
        keyframeInterval: options.keyframeInterval || 120,
        adaptation: options.adaptation || 'single',
        ...options
      }
    };

    try {
      let ffmpegProcess;

      if (streamConfig.options.adaptation === 'adaptive') {
        ffmpegProcess = this.createAdaptiveFFmpegProcess(streamConfig);
      } else {
        ffmpegProcess = this.createSingleFFmpegProcess(streamConfig);
      }

      streamConfig.process = ffmpegProcess;
      this.activeStreams.set(streamId, streamConfig);

      await this.setupEventHandlers(streamConfig);

      console.log(`[DASH] Started stream ${streamId}`);
      return {
        streamId,
        manifestUrl: `${this.getBaseUrl()}/${streamId}/manifest.mpd`,
        outputPath,
        type: streamConfig.options.adaptation
      };
    } catch (error) {
      await this.cleanup(streamId);
      throw error;
    }
  }

  createSingleFFmpegProcess(config) {
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
      '-keyint_min', options.keyframeInterval.toString(),
      '-sc_threshold', '0',

      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',

      '-f', 'dash',
      '-seg_duration', this.segmentDuration.toString(),
      '-window_size', this.windowSize.toString(),
      '-extra_window_size', '2',
      '-remove_at_exit', '1',
      '-adaptation_sets', 'id=0,streams=v id=1,streams=a',
      '-dash_segment_type', 'mp4',

      path.join(outputPath, 'manifest.mpd')
    ];

    return spawn('ffmpeg', ffmpegArgs);
  }

  createAdaptiveFFmpegProcess(config) {
    const { inputSource, outputPath } = config;

    const representations = [
      { height: 1080, bitrate: '3000k', suffix: '1080p' },
      { height: 720, bitrate: '1500k', suffix: '720p' },
      { height: 480, bitrate: '800k', suffix: '480p' },
      { height: 360, bitrate: '400k', suffix: '360p' }
    ];

    const videoMaps = [];
    const audioMaps = [];
    const adaptationSets = [];

    let mapIndex = 0;

    representations.forEach((rep, index) => {
      const width = Math.round((rep.height * 16) / 9);

      videoMaps.push(
        '-map', '0:v:0',
        '-c:v:' + index, 'libx264',
        '-preset:v:' + index, 'fast',
        '-crf:v:' + index, '23',
        '-maxrate:v:' + index, rep.bitrate,
        '-bufsize:v:' + index, `${parseInt(rep.bitrate) * 2}k`,
        '-s:v:' + index, `${width}x${rep.height}`,
        '-profile:v:' + index, 'high',
        '-level:v:' + index, '4.0'
      );

      adaptationSets.push(`id=${index},streams=v:${index}`);
      mapIndex++;
    });

    audioMaps.push(
      '-map', '0:a:0',
      '-c:a:0', 'aac',
      '-b:a:0', '128k',
      '-ar:a:0', '44100'
    );

    adaptationSets.push(`id=${representations.length},streams=a:0`);

    const ffmpegArgs = [
      '-i', inputSource,

      ...videoMaps,
      ...audioMaps,

      '-f', 'dash',
      '-seg_duration', this.segmentDuration.toString(),
      '-window_size', this.windowSize.toString(),
      '-extra_window_size', '2',
      '-remove_at_exit', '1',
      '-adaptation_sets', adaptationSets.join(' '),
      '-dash_segment_type', 'mp4',
      '-use_template', '1',
      '-use_timeline', '1',

      path.join(outputPath, 'manifest.mpd')
    ];

    return spawn('ffmpeg', ffmpegArgs);
  }

  async setupEventHandlers(config) {
    const { streamId, process } = config;

    process.stdout.on('data', (data) => {
      console.log(`[DASH:${streamId}] stdout: ${data}`);
    });

    process.stderr.on('data', (data) => {
      console.log(`[DASH:${streamId}] stderr: ${data}`);
    });

    process.on('close', (code) => {
      console.log(`[DASH:${streamId}] Process closed with code ${code}`);
      this.activeStreams.delete(streamId);
    });

    process.on('error', (error) => {
      console.error(`[DASH:${streamId}] Process error:`, error);
      this.activeStreams.delete(streamId);
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('DASH stream setup timeout'));
      }, 15000);

      const checkManifest = () => {
        const manifestPath = path.join(config.outputPath, 'manifest.mpd');
        if (fs.existsSync(manifestPath)) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkManifest, 1000);
        }
      };

      checkManifest();
    });
  }

  async stopStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error(`DASH stream ${streamId} not found`);
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
      console.log(`[DASH] Stopped stream ${streamId}`);

      return {
        streamId,
        duration: Date.now() - stream.startTime
      };
    } catch (error) {
      console.error(`[DASH] Error stopping stream ${streamId}:`, error);
      throw error;
    }
  }

  async createLiveStream(streamId, inputSource, options = {}) {
    const liveOptions = {
      ...options,
      liveProfile: true,
      segmentDuration: 2,
      windowSize: 10,
      utcTiming: true
    };

    const outputPath = path.join(this.outputDir, streamId);
    await this.ensureDirectoryExists(outputPath);

    const ffmpegArgs = [
      '-i', inputSource,

      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-maxrate', liveOptions.bitrate || '2000k',
      '-bufsize', `${parseInt(liveOptions.bitrate || '2000') * 2}k`,
      '-s', liveOptions.resolution || '1280x720',
      '-r', (liveOptions.framerate || 30).toString(),
      '-g', (liveOptions.keyframeInterval || 60).toString(),
      '-keyint_min', (liveOptions.keyframeInterval || 60).toString(),

      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',

      '-f', 'dash',
      '-seg_duration', liveOptions.segmentDuration.toString(),
      '-window_size', liveOptions.windowSize.toString(),
      '-extra_window_size', '3',
      '-remove_at_exit', '1',
      '-streaming', '1',
      '-ldash', '1',
      '-dash_segment_type', 'mp4',

      path.join(outputPath, 'manifest.mpd')
    ];

    if (liveOptions.utcTiming) {
      ffmpegArgs.splice(-1, 0, '-utc_timing_url', 'https://time.akamai.com/?iso');
    }

    const process = spawn('ffmpeg', ffmpegArgs);

    const streamConfig = {
      streamId,
      inputSource,
      outputPath,
      startTime: Date.now(),
      process,
      type: 'live',
      options: liveOptions
    };

    this.activeStreams.set(streamId, streamConfig);
    await this.setupEventHandlers(streamConfig);

    return {
      streamId,
      type: 'live',
      manifestUrl: `${this.getBaseUrl()}/${streamId}/manifest.mpd`,
      outputPath
    };
  }

  getStreamStats(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      return null;
    }

    const stats = {
      streamId,
      type: stream.type || 'vod',
      status: 'active',
      duration: Date.now() - stream.startTime,
      outputPath: stream.outputPath,
      segmentDuration: this.segmentDuration,
      windowSize: this.windowSize
    };

    if (stream.options) {
      stats.resolution = stream.options.resolution;
      stats.bitrate = stream.options.bitrate;
      stats.adaptation = stream.options.adaptation;
    }

    return stats;
  }

  getAllStreams() {
    return Array.from(this.activeStreams.keys()).map(streamId =>
      this.getStreamStats(streamId)
    );
  }

  async getManifestContent(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      throw new Error(`DASH stream ${streamId} not found`);
    }

    const manifestPath = path.join(stream.outputPath, 'manifest.mpd');

    try {
      const content = await fs.promises.readFile(manifestPath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read manifest for stream ${streamId}: ${error.message}`);
    }
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.promises.access(dirPath);
    } catch {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  getBaseUrl() {
    return process.env.DASH_BASE_URL || `http://localhost:${process.env.PORT || 3001}/dash`;
  }

  async cleanup(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream && stream.process && !stream.process.killed) {
      stream.process.kill('SIGTERM');
      this.activeStreams.delete(streamId);
    }
  }

  async shutdown() {
    console.log('[DASH] Shutting down all streams...');

    const shutdownPromises = Array.from(this.activeStreams.keys()).map(streamId =>
      this.stopStream(streamId).catch(console.error)
    );

    await Promise.all(shutdownPromises);
  }
}

module.exports = DASHStreamer;