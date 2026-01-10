#!/bin/bash

# Bookati Development Startup Script
# This script ensures everything starts in the correct order

set -e  # Exit on any error

echo "🚀 Starting Bookati Development Environment"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if server/.env exists
if [ ! -f "server/.env" ]; then
    echo -e "${RED}❌ ERROR: server/.env file not found${NC}"
    echo ""
    echo "The backend server requires a .env file with database credentials."
    echo "Please ensure server/.env exists with the following:"
    echo ""
    echo "  DATABASE_URL=postgresql://..."
    echo "  JWT_SECRET=your-secret-key"
    echo "  SUPABASE_URL=https://..."
    echo "  SUPABASE_ANON_KEY=..."
    echo ""
    echo "See server/.env.example for a template"
    exit 1
fi

# Check if DATABASE_URL is set in .env
if ! grep -q "DATABASE_URL=" server/.env || grep -q "DATABASE_URL=$" server/.env; then
    echo -e "${RED}❌ ERROR: DATABASE_URL is not set in server/.env${NC}"
    echo ""
    echo "Please edit server/.env and set your Supabase DATABASE_URL"
    exit 1
fi

echo -e "${GREEN}✅ Configuration files found${NC}"
echo ""

# Test database connection
echo "🔍 Testing database connection..."
cd server
if node -e "
  require('dotenv').config();
  const pg = require('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('SELECT NOW()')
    .then(() => { console.log('✅ Database connection successful'); pool.end(); process.exit(0); })
    .catch(err => { console.error('❌ Database connection failed:', err.message); pool.end(); process.exit(1); });
" 2>/dev/null; then
    echo -e "${GREEN}✅ Database is reachable${NC}"
else
    echo -e "${RED}❌ Cannot connect to database${NC}"
    echo ""
    echo "Please check:"
    echo "  1. DATABASE_URL is correct in server/.env"
    echo "  2. You have internet connection"
    echo "  3. Supabase project is active"
    exit 1
fi
cd ..
echo ""

# Kill any existing processes on port 3001
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port 3001 is in use. Stopping existing process...${NC}"
    kill -9 $(lsof -Pi :3001 -sTCP:LISTEN -t) 2>/dev/null || true
    sleep 2
fi

# Start backend server
echo "🖥️  Starting backend server..."
cd server
npm run dev > /tmp/server.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > /tmp/server.pid
cd ..

# Wait for server to be ready
echo "⏳ Waiting for server to start..."
for i in {1..30}; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend server is running (PID: $SERVER_PID)${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Backend server failed to start${NC}"
        echo ""
        echo "Check the logs:"
        echo "  tail -f /tmp/server.log"
        exit 1
    fi
    sleep 1
done
echo ""

# Display server info
echo "📊 Server Status:"
echo "  Backend: http://localhost:3001"
echo "  Health:  http://localhost:3001/api/health"
echo "  Logs:    tail -f /tmp/server.log"
echo ""

# Check if frontend dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
    echo ""
fi

# Start frontend
echo "🎨 Starting frontend development server..."
echo ""
echo "==========================================="
echo -e "${GREEN}✅ SYSTEM READY${NC}"
echo "==========================================="
echo ""
echo "Frontend will be available at: http://localhost:5173"
echo "Login page: http://localhost:5173/login"
echo ""
echo "Test credentials:"
echo "  Email: admin@bookati.com"
echo "  Password: Admin123456"
echo ""
echo "To stop the backend server:"
echo "  kill $SERVER_PID"
echo ""
echo "Press Ctrl+C to stop the frontend"
echo ""

# Start frontend (this will keep script running)
npm run dev
