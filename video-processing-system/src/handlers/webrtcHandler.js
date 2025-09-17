const mediasoup = require('mediasoup');

class WebRTCHandler {
  constructor() {
    this.workers = [];
    this.routers = new Map();
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.io = null;
  }

  async init(io) {
    this.io = io;
    await this.createWorkers();
    await this.createRouters();
    console.log('[WebRTC] Handler initialized');
  }

  async createWorkers() {
    const numWorkers = require('os').cpus().length;

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 10000 + (i * 1000),
        rtcMaxPort: 10000 + (i * 1000) + 999,
      });

      worker.on('died', () => {
        console.error('[WebRTC] Worker died, restarting...');
        this.createWorkers();
      });

      this.workers.push(worker);
    }

    console.log(`[WebRTC] Created ${numWorkers} workers`);
  }

  async createRouters() {
    const mediaCodecs = [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '4d0032',
          'level-asymmetry-allowed': 1,
        },
      },
    ];

    for (const worker of this.workers) {
      const router = await worker.createRouter({ mediaCodecs });
      this.routers.set(worker.pid, router);
    }

    console.log(`[WebRTC] Created ${this.routers.size} routers`);
  }

  getRouter() {
    const workers = Array.from(this.routers.keys());
    const randomWorker = workers[Math.floor(Math.random() * workers.length)];
    return this.routers.get(randomWorker);
  }

  async createWebRtcTransport(socketId, direction) {
    const router = this.getRouter();

    const transport = await router.createWebRtcTransport({
      listenIps: [
        {
          ip: process.env.WEBRTC_LISTEN_IP || '0.0.0.0',
          announcedIp: process.env.WEBRTC_ANNOUNCED_IP || '127.0.0.1',
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
        this.transports.delete(`${socketId}_${direction}`);
      }
    });

    this.transports.set(`${socketId}_${direction}`, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(socketId, direction, dtlsParameters) {
    const transport = this.transports.get(`${socketId}_${direction}`);
    if (!transport) {
      throw new Error('Transport not found');
    }

    await transport.connect({ dtlsParameters });
  }

  async produce(socketId, rtpParameters, kind) {
    const transport = this.transports.get(`${socketId}_send`);
    if (!transport) {
      throw new Error('Send transport not found');
    }

    const producer = await transport.produce({
      kind,
      rtpParameters,
    });

    producer.on('transportclose', () => {
      producer.close();
      this.producers.delete(producer.id);
    });

    this.producers.set(producer.id, {
      producer,
      socketId,
      kind,
    });

    this.sendToProcessingEngine(producer.id, producer);

    return { id: producer.id };
  }

  async consume(socketId, producerId, rtpCapabilities) {
    const router = this.getRouter();
    const transport = this.transports.get(`${socketId}_recv`);

    if (!transport) {
      throw new Error('Receive transport not found');
    }

    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });

    consumer.on('transportclose', () => {
      consumer.close();
      this.consumers.delete(consumer.id);
    });

    this.consumers.set(consumer.id, {
      consumer,
      socketId,
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  sendToProcessingEngine(producerId, producer) {
    global.videoProcessor?.processWebRTCProducer(producerId, producer);
  }

  async handleSocketConnection(socket) {
    socket.on('getRouterRtpCapabilities', (callback) => {
      const router = this.getRouter();
      callback(router.rtpCapabilities);
    });

    socket.on('createWebRtcTransport', async (data, callback) => {
      try {
        const params = await this.createWebRtcTransport(socket.id, data.direction);
        callback(params);
      } catch (error) {
        callback({ error: error.message });
      }
    });

    socket.on('connectTransport', async (data, callback) => {
      try {
        await this.connectTransport(socket.id, data.direction, data.dtlsParameters);
        callback({ success: true });
      } catch (error) {
        callback({ error: error.message });
      }
    });

    socket.on('produce', async (data, callback) => {
      try {
        const result = await this.produce(socket.id, data.rtpParameters, data.kind);
        callback(result);
      } catch (error) {
        callback({ error: error.message });
      }
    });

    socket.on('consume', async (data, callback) => {
      try {
        const result = await this.consume(socket.id, data.producerId, data.rtpCapabilities);
        callback(result);
      } catch (error) {
        callback({ error: error.message });
      }
    });

    socket.on('disconnect', () => {
      this.cleanupSocket(socket.id);
    });
  }

  cleanupSocket(socketId) {
    for (const [key, transport] of this.transports) {
      if (key.startsWith(socketId)) {
        transport.close();
        this.transports.delete(key);
      }
    }

    for (const [id, data] of this.producers) {
      if (data.socketId === socketId) {
        data.producer.close();
        this.producers.delete(id);
      }
    }

    for (const [id, data] of this.consumers) {
      if (data.socketId === socketId) {
        data.consumer.close();
        this.consumers.delete(id);
      }
    }
  }
}

module.exports = new WebRTCHandler();