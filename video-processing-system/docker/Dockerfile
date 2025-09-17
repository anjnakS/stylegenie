# Multi-stage Docker build for video processing system

# Stage 1: Node.js backend
FROM node:18-alpine AS backend

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copy backend package files
COPY package*.json ./
COPY src/ ./src/

# Install Node.js dependencies
RUN npm ci --only=production

# Stage 2: Python processing engine
FROM python:3.11-slim AS processing

WORKDIR /processing

# Install system dependencies for Python
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    libopencv-dev \
    python3-opencv \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements and install
COPY processing/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy processing code
COPY processing/ .

# Stage 3: React frontend build
FROM node:18-alpine AS frontend-build

WORKDIR /app

# Copy client package files
COPY client/package*.json ./
RUN npm ci

# Copy client source and build
COPY client/ .
RUN npm run build

# Stage 4: Final production image
FROM node:18-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    nginx \
    supervisor

# Create necessary directories
RUN mkdir -p /app/uploads /app/output/hls /app/output/dash /app/temp \
    && mkdir -p /var/log/supervisor

# Copy backend from stage 1
COPY --from=backend /app/node_modules ./node_modules
COPY --from=backend /app/src ./src
COPY --from=backend /app/package*.json ./

# Copy processing engine from stage 2
COPY --from=processing /processing ./processing
COPY --from=processing /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Copy frontend build from stage 3
COPY --from=frontend-build /app/build ./client/build

# Copy configuration files
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy startup script
COPY docker/start.sh ./start.sh
RUN chmod +x ./start.sh

# Expose ports
EXPOSE 3001 1935 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start services
CMD ["./start.sh"]