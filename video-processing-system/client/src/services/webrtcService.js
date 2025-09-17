class WebRTCService {
  constructor(socket) {
    this.socket = socket;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producer = null;
    this.consumer = null;
    this.isProducing = false;
    this.isConsuming = false;

    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  async initializeMediasoup() {
    try {
      const routerRtpCapabilities = await this.socketRequest('getRouterRtpCapabilities');

      await this.loadDevice(routerRtpCapabilities);

      console.log('Mediasoup initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Mediasoup:', error);
      throw error;
    }
  }

  async loadDevice(routerRtpCapabilities) {
    try {
      const { Device } = await import('mediasoup-client');
      this.device = new Device();

      await this.device.load({ routerRtpCapabilities });

      console.log('Device loaded with RTP capabilities');
    } catch (error) {
      console.error('Failed to load device:', error);
      throw error;
    }
  }

  async createSendTransport() {
    try {
      const transportInfo = await this.socketRequest('createWebRtcTransport', {
        direction: 'send'
      });

      this.sendTransport = this.device.createSendTransport(transportInfo);

      this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socketRequest('connectTransport', {
            direction: 'send',
            dtlsParameters
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const { id } = await this.socketRequest('produce', {
            kind,
            rtpParameters
          });
          callback({ id });
        } catch (error) {
          errback(error);
        }
      });

      console.log('Send transport created');
      return this.sendTransport;
    } catch (error) {
      console.error('Failed to create send transport:', error);
      throw error;
    }
  }

  async createRecvTransport() {
    try {
      const transportInfo = await this.socketRequest('createWebRtcTransport', {
        direction: 'recv'
      });

      this.recvTransport = this.device.createRecvTransport(transportInfo);

      this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.socketRequest('connectTransport', {
            direction: 'recv',
            dtlsParameters
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      console.log('Receive transport created');
      return this.recvTransport;
    } catch (error) {
      console.error('Failed to create receive transport:', error);
      throw error;
    }
  }

  async startProducing(stream) {
    try {
      if (!this.sendTransport) {
        await this.createSendTransport();
      }

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) {
        this.videoProducer = await this.sendTransport.produce({
          track: videoTrack,
          codecOptions: {
            videoGoogleStartBitrate: 1000
          }
        });

        this.videoProducer.on('trackended', () => {
          console.log('Video track ended');
        });

        this.videoProducer.on('transportclose', () => {
          console.log('Video producer transport closed');
        });
      }

      if (audioTrack) {
        this.audioProducer = await this.sendTransport.produce({
          track: audioTrack
        });

        this.audioProducer.on('trackended', () => {
          console.log('Audio track ended');
        });

        this.audioProducer.on('transportclose', () => {
          console.log('Audio producer transport closed');
        });
      }

      this.isProducing = true;
      console.log('Started producing media');

    } catch (error) {
      console.error('Failed to start producing:', error);
      throw error;
    }
  }

  async startConsuming(producerId) {
    try {
      if (!this.recvTransport) {
        await this.createRecvTransport();
      }

      const consumerInfo = await this.socketRequest('consume', {
        producerId,
        rtpCapabilities: this.device.rtpCapabilities
      });

      this.consumer = await this.recvTransport.consume(consumerInfo);

      const stream = new MediaStream();
      stream.addTrack(this.consumer.track);

      this.remoteStream = stream;
      this.isConsuming = true;

      console.log('Started consuming media');
      return stream;

    } catch (error) {
      console.error('Failed to start consuming:', error);
      throw error;
    }
  }

  async getUserMedia(constraints = { video: true, audio: true }) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Got user media');
      return this.localStream;
    } catch (error) {
      console.error('Failed to get user media:', error);
      throw error;
    }
  }

  async getDisplayMedia(constraints = { video: true, audio: true }) {
    try {
      this.localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      console.log('Got display media');
      return this.localStream;
    } catch (error) {
      console.error('Failed to get display media:', error);
      throw error;
    }
  }

  async startWebcamStream() {
    try {
      await this.initializeMediasoup();

      const stream = await this.getUserMedia({
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          frameRate: { min: 15, ideal: 30, max: 60 }
        },
        audio: true
      });

      await this.startProducing(stream);

      return stream;
    } catch (error) {
      console.error('Failed to start webcam stream:', error);
      throw error;
    }
  }

  async startScreenShare() {
    try {
      await this.initializeMediasoup();

      const stream = await this.getDisplayMedia({
        video: true,
        audio: true
      });

      await this.startProducing(stream);

      return stream;
    } catch (error) {
      console.error('Failed to start screen share:', error);
      throw error;
    }
  }

  async stopProducing() {
    try {
      if (this.videoProducer) {
        this.videoProducer.close();
        this.videoProducer = null;
      }

      if (this.audioProducer) {
        this.audioProducer.close();
        this.audioProducer = null;
      }

      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }

      this.isProducing = false;
      console.log('Stopped producing');

    } catch (error) {
      console.error('Failed to stop producing:', error);
      throw error;
    }
  }

  async stopConsuming() {
    try {
      if (this.consumer) {
        this.consumer.close();
        this.consumer = null;
      }

      this.remoteStream = null;
      this.isConsuming = false;
      console.log('Stopped consuming');

    } catch (error) {
      console.error('Failed to stop consuming:', error);
      throw error;
    }
  }

  getStats() {
    const stats = {
      isProducing: this.isProducing,
      isConsuming: this.isConsuming,
      hasLocalStream: !!this.localStream,
      hasRemoteStream: !!this.remoteStream
    };

    if (this.videoProducer) {
      stats.videoProducer = {
        id: this.videoProducer.id,
        kind: this.videoProducer.kind,
        paused: this.videoProducer.paused
      };
    }

    if (this.audioProducer) {
      stats.audioProducer = {
        id: this.audioProducer.id,
        kind: this.audioProducer.kind,
        paused: this.audioProducer.paused
      };
    }

    return stats;
  }

  socketRequest(event, data = {}) {
    return new Promise((resolve, reject) => {
      this.socket.emit(event, data, (response) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }

  cleanup() {
    this.stopProducing();
    this.stopConsuming();

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    console.log('WebRTC service cleaned up');
  }
}

export default WebRTCService;