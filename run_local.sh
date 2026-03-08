#!/bin/bash

# Exit when any command fails
set -e

# Make sure we're in the right directory
cd "$(dirname "$0")"

# Local dev should not inherit broken corporate/system proxy vars.
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
export NO_PROXY="localhost,127.0.0.1,0.0.0.0"
export no_proxy="$NO_PROXY"

echo "Starting Vantage local environment..."

# 1. Start backend in the background
echo "Starting backend API..."
cd backend
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment and installing python dependencies..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    pip install -e . --no-deps
else
    source .venv/bin/activate
fi
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to initialize
sleep 2

# 2. Start frontend in the foreground
echo "Starting Next.js frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    npm install
fi
npm run dev &
FRONTEND_PID=$!
cd ..

# Function to cleanly shut down both processes when Ctrl+C is pressed
function cleanup() {
    echo ""
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Done."
    exit
}

# Trap SIGINT (Ctrl+C) and call the cleanup function
trap cleanup SIGINT

echo "--------------------------------------------------------"
echo "✅ Vantage is running locally!"
echo "➡️  Frontend: http://localhost:3000"
echo "➡️  Backend API Docs: http://localhost:8000/docs"
echo "Press Ctrl+C to stop both."
echo "--------------------------------------------------------"

# Wait for background processes to keep script alive
wait
