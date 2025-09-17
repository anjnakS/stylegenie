import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children, onConnectionChange }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:3001', {
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      onConnectionChange?.('connected');
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
      onConnectionChange?.('disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setConnected(false);
      onConnectionChange?.('error');
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [onConnectionChange]);

  const socketService = {
    socket,
    connected,

    emit: (event, data, callback) => {
      if (socket && connected) {
        socket.emit(event, data, callback);
      } else {
        console.warn('Socket not connected, cannot emit:', event);
      }
    },

    on: (event, callback) => {
      if (socket) {
        socket.on(event, callback);
      }
    },

    off: (event, callback) => {
      if (socket) {
        socket.off(event, callback);
      }
    },

    sendVideoFrame: (frameData) => {
      if (socket && connected) {
        socket.emit('video-frame', frameData);
      }
    },

    startFrameStream: (config) => {
      return new Promise((resolve, reject) => {
        if (socket && connected) {
          socket.emit('start-stream', config);
          socket.once('stream-started', (response) => {
            if (response.success) {
              resolve(response);
            } else {
              reject(new Error('Failed to start stream'));
            }
          });
        } else {
          reject(new Error('Socket not connected'));
        }
      });
    },

    stopFrameStream: () => {
      return new Promise((resolve) => {
        if (socket && connected) {
          socket.emit('stop-stream');
          socket.once('stream-stopped', resolve);
        } else {
          resolve();
        }
      });
    },

    getStreamStats: () => {
      return new Promise((resolve, reject) => {
        if (socket && connected) {
          socket.emit('get-stream-stats', (stats) => {
            resolve(stats);
          });
        } else {
          reject(new Error('Socket not connected'));
        }
      });
    },

    configureProcessing: (config) => {
      if (socket && connected) {
        socket.emit('configure-processing', config);
      }
    }
  };

  return (
    <SocketContext.Provider value={socketService}>
      {children}
    </SocketContext.Provider>
  );
};