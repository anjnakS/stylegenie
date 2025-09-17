#!/bin/bash

# Setup script for Video Processing System

set -e

echo "🚀 Setting up Video Processing System..."

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "⚠️  This script should not be run as root"
   exit 1
fi

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    OS="windows"
fi

echo "📋 Detected OS: $OS"

# Function to install system dependencies
install_system_deps() {
    echo "📦 Installing system dependencies..."

    case $OS in
        "linux")
            sudo apt update
            sudo apt install -y \
                nodejs npm \
                python3 python3-pip \
                ffmpeg \
                libgstreamer1.0-dev \
                libgstreamer-plugins-base1.0-dev \
                gstreamer1.0-plugins-base \
                gstreamer1.0-plugins-good \
                gstreamer1.0-plugins-bad \
                gstreamer1.0-plugins-ugly \
                gstreamer1.0-libav \
                libopencv-dev \
                redis-server \
                nginx
            ;;
        "macos")
            if ! command -v brew &> /dev/null; then
                echo "❌ Homebrew not found. Please install Homebrew first."
                exit 1
            fi
            brew install node python ffmpeg gstreamer opencv redis nginx
            ;;
        "windows")
            echo "⚠️  Windows detected. Please ensure you have:"
            echo "   - Node.js 18+"
            echo "   - Python 3.8+"
            echo "   - FFmpeg"
            echo "   - Redis (optional)"
            ;;
        *)
            echo "❌ Unsupported OS: $OS"
            exit 1
            ;;
    esac
}

# Function to setup Node.js backend
setup_backend() {
    echo "🔧 Setting up Node.js backend..."

    # Check Node.js version
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js not found"
        return 1
    fi

    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        echo "❌ Node.js 16+ required, found: $(node --version)"
        return 1
    fi

    echo "✅ Node.js $(node --version) found"

    # Install backend dependencies
    npm install

    # Create necessary directories
    mkdir -p uploads output/hls output/dash temp logs

    echo "✅ Backend setup complete"
}

# Function to setup Python processing engine
setup_processing() {
    echo "🔧 Setting up Python processing engine..."

    # Check Python version
    if ! command -v python3 &> /dev/null; then
        echo "❌ Python3 not found"
        return 1
    fi

    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1-2)
    echo "✅ Python $PYTHON_VERSION found"

    # Install Python dependencies
    cd processing
    pip3 install -r requirements.txt
    cd ..

    echo "✅ Processing engine setup complete"
}

# Function to setup React frontend
setup_frontend() {
    echo "🔧 Setting up React frontend..."

    cd client
    npm install
    npm run build
    cd ..

    echo "✅ Frontend setup complete"
}

# Function to setup environment
setup_environment() {
    echo "🔧 Setting up environment..."

    # Copy environment file
    if [ ! -f .env ]; then
        cp .env.example .env
        echo "📝 Created .env file from template"
        echo "⚠️  Please edit .env file with your configuration"
    else
        echo "✅ .env file already exists"
    fi

    # Set permissions
    chmod 755 scripts/*.sh
    chmod 755 docker/start.sh

    echo "✅ Environment setup complete"
}

# Function to test installation
test_installation() {
    echo "🧪 Testing installation..."

    # Test Node.js modules
    if node -e "require('./src/server.js')" 2>/dev/null; then
        echo "❌ Node.js modules test failed"
    else
        echo "✅ Node.js modules test passed"
    fi

    # Test Python modules
    cd processing
    if python3 -c "
import cv2, numpy, torch
print('✅ Python modules test passed')
" 2>/dev/null; then
        echo "✅ Python modules test passed"
    else
        echo "⚠️  Python modules test failed (some optional dependencies may be missing)"
    fi
    cd ..

    # Test FFmpeg
    if command -v ffmpeg &> /dev/null; then
        echo "✅ FFmpeg test passed"
    else
        echo "❌ FFmpeg test failed"
    fi

    echo "✅ Installation test complete"
}

# Main installation process
main() {
    echo "🎬 Video Processing System Setup"
    echo "================================"

    # Ask for user confirmation
    read -p "Do you want to install system dependencies? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_system_deps
    fi

    setup_environment
    setup_backend
    setup_processing
    setup_frontend
    test_installation

    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your configuration"
    echo "2. Start Redis server (if using): redis-server"
    echo "3. Start the application: npm start"
    echo "4. Or use Docker: docker-compose up"
    echo ""
    echo "Access the application at: http://localhost:3001"
    echo "RTMP endpoint: rtmp://localhost:1935/live/{stream_key}"
}

# Run main function
main "$@"