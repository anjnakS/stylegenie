#!/bin/bash

# Development server script

set -e

echo "🚀 Starting Video Processing System in Development Mode"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if port is in use
port_in_use() {
    netstat -an | grep -q ":$1 "
}

# Function to start Redis if needed
start_redis() {
    if command_exists redis-server && ! port_in_use 6379; then
        echo "🔴 Starting Redis server..."
        redis-server --daemonize yes
        sleep 2
    fi
}

# Function to start Python processing engine
start_processing() {
    echo "🐍 Starting Python processing engine..."
    cd processing
    python3 video_processor.py &
    PROCESSOR_PID=$!
    cd ..
    echo "Processing engine started with PID: $PROCESSOR_PID"
}

# Function to start Node.js backend
start_backend() {
    echo "🟢 Starting Node.js backend..."
    npm run dev &
    BACKEND_PID=$!
    echo "Backend started with PID: $BACKEND_PID"
}

# Function to start React frontend
start_frontend() {
    echo "⚛️  Starting React frontend..."
    cd client
    npm start &
    FRONTEND_PID=$!
    cd ..
    echo "Frontend started with PID: $FRONTEND_PID"
}

# Function to cleanup processes
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."

    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        echo "Frontend stopped"
    fi

    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
        echo "Backend stopped"
    fi

    if [ ! -z "$PROCESSOR_PID" ]; then
        kill $PROCESSOR_PID 2>/dev/null || true
        echo "Processing engine stopped"
    fi

    echo "✅ All services stopped"
    exit 0
}

# Function to show status
show_status() {
    echo ""
    echo "📊 Service Status:"
    echo "=================="
    echo "Frontend:  http://localhost:3000"
    echo "Backend:   http://localhost:3001"
    echo "API:       http://localhost:3001/api"
    echo "Health:    http://localhost:3001/health"
    echo "RTMP:      rtmp://localhost:1935/live/{stream_key}"
    echo ""
    echo "Press Ctrl+C to stop all services"
}

# Function to wait for services
wait_for_services() {
    echo "⏳ Waiting for services to start..."
    sleep 5

    # Check backend health
    for i in {1..30}; do
        if curl -s http://localhost:3001/health >/dev/null 2>&1; then
            echo "✅ Backend is healthy"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "❌ Backend health check failed"
        fi
        sleep 1
    done

    # Check frontend
    for i in {1..30}; do
        if curl -s http://localhost:3000 >/dev/null 2>&1; then
            echo "✅ Frontend is accessible"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "❌ Frontend is not accessible"
        fi
        sleep 1
    done
}

# Main function
main() {
    # Check if .env exists
    if [ ! -f .env ]; then
        echo "⚠️  .env file not found. Copying from .env.example"
        cp .env.example .env
        echo "📝 Please edit .env file with your configuration"
    fi

    # Check dependencies
    if ! command_exists node; then
        echo "❌ Node.js not found. Please install Node.js 16+"
        exit 1
    fi

    if ! command_exists python3; then
        echo "❌ Python3 not found. Please install Python 3.8+"
        exit 1
    fi

    # Create necessary directories
    mkdir -p uploads output/hls output/dash temp logs

    # Set trap for cleanup
    trap cleanup SIGINT SIGTERM

    # Start services
    start_redis
    start_processing
    start_backend
    start_frontend

    # Wait for services to be ready
    wait_for_services

    # Show status
    show_status

    # Keep script running
    while true; do
        sleep 1
    done
}

# Handle command line arguments
case "${1:-}" in
    "backend")
        echo "🟢 Starting backend only..."
        start_redis
        start_processing
        start_backend
        trap cleanup SIGINT SIGTERM
        wait
        ;;
    "frontend")
        echo "⚛️  Starting frontend only..."
        start_frontend
        trap cleanup SIGINT SIGTERM
        wait
        ;;
    "processing")
        echo "🐍 Starting processing engine only..."
        start_processing
        trap cleanup SIGINT SIGTERM
        wait
        ;;
    *)
        main
        ;;
esac