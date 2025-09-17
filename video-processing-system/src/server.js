const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const rtmpHandler = require('./handlers/rtmpHandler');
const webrtcHandler = require('./handlers/webrtcHandler');
const websocketHandler = require('./handlers/websocketHandler');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('client/build'));

app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  websocketHandler.handleConnection(socket, io);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

rtmpHandler.init();
webrtcHandler.init(io);

server.listen(PORT, () => {
  console.log(`Video Processing Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
  console.log(`RTMP server ready on port ${process.env.RTMP_PORT || 1935}`);
});