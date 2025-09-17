const express = require('express');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/mov', 'video/avi'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video files are allowed.'));
    }
  }
});

router.get('/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

router.get('/streams', (req, res) => {
  const rtmpStreams = global.rtmpHandler?.getActiveStreams() || [];
  const websocketConnections = global.websocketHandler?.getActiveConnections() || [];

  res.json({
    rtmp: rtmpStreams,
    websocket: websocketConnections,
    total: rtmpStreams.length + websocketConnections.length
  });
});

router.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  const videoId = req.file.filename;

  global.videoProcessor?.processUploadedVideo(req.file.path, videoId);

  res.json({
    success: true,
    videoId,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    path: req.file.path
  });
});

router.get('/video/:videoId/status', (req, res) => {
  const { videoId } = req.params;

  const status = global.videoProcessor?.getProcessingStatus(videoId);

  if (!status) {
    return res.status(404).json({ error: 'Video not found' });
  }

  res.json(status);
});

router.post('/video/:videoId/process', (req, res) => {
  const { videoId } = req.params;
  const { effects, options } = req.body;

  try {
    global.videoProcessor?.startProcessing(videoId, { effects, options });

    res.json({
      success: true,
      videoId,
      message: 'Processing started'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start processing',
      message: error.message
    });
  }
});

router.get('/video/:videoId/download', (req, res) => {
  const { videoId } = req.params;

  const filePath = global.videoProcessor?.getProcessedVideoPath(videoId);

  if (!filePath) {
    return res.status(404).json({ error: 'Processed video not found' });
  }

  res.download(filePath, `processed_${videoId}.mp4`);
});

router.post('/stream/hls/:streamId', (req, res) => {
  const { streamId } = req.params;
  const { quality, bitrate } = req.body;

  try {
    const hlsUrl = global.videoProcessor?.generateHLSStream(streamId, { quality, bitrate });

    res.json({
      success: true,
      streamId,
      hlsUrl,
      playlistUrl: `${hlsUrl}/playlist.m3u8`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate HLS stream',
      message: error.message
    });
  }
});

router.post('/stream/dash/:streamId', (req, res) => {
  const { streamId } = req.params;
  const { quality, bitrate } = req.body;

  try {
    const dashUrl = global.videoProcessor?.generateDASHStream(streamId, { quality, bitrate });

    res.json({
      success: true,
      streamId,
      dashUrl,
      manifestUrl: `${dashUrl}/manifest.mpd`
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate DASH stream',
      message: error.message
    });
  }
});

router.get('/processing/stats', (req, res) => {
  const stats = global.videoProcessor?.getSystemStats() || {};

  res.json({
    ...stats,
    timestamp: new Date().toISOString()
  });
});

router.post('/processing/config', (req, res) => {
  const config = req.body;

  try {
    global.videoProcessor?.updateGlobalConfig(config);

    res.json({
      success: true,
      config,
      message: 'Configuration updated'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update configuration',
      message: error.message
    });
  }
});

module.exports = router;