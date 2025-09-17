#!/bin/bash

# Start script for video processing system

echo "Starting Video Processing System..."

# Create necessary directories
mkdir -p /app/uploads /app/output/hls /app/output/dash /app/temp /app/logs
mkdir -p /var/log/supervisor

# Set proper permissions
chown -R root:root /app
chmod -R 755 /app/uploads /app/output /app/temp

# Copy environment file if it doesn't exist
if [ ! -f /app/.env ]; then
    cp /app/.env.example /app/.env
fi

# Initialize Python environment for video processor
cd /app/processing
python3 -c "
import sys
print('Python version:', sys.version)

try:
    import cv2
    print('OpenCV version:', cv2.__version__)
except ImportError:
    print('OpenCV not available')

try:
    import torch
    print('PyTorch version:', torch.__version__)
    print('CUDA available:', torch.cuda.is_available())
except ImportError:
    print('PyTorch not available')

try:
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import Gst
    Gst.init(None)
    print('GStreamer available')
except ImportError:
    print('GStreamer not available')
"

# Test FFmpeg
ffmpeg -version | head -1

# Go back to app directory
cd /app

# Start supervisord which will manage all services
echo "Starting services with supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf