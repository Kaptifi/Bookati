# Backend Server

## Quick Start

### Option 1: Using Batch File (Windows)
Double-click `start-server.bat` to start the server.

### Option 2: Using Command Line
```bash
cd project/server
npm run dev
```

## Requirements

1. **Node.js** (v18 or higher)
2. **PostgreSQL** database running
3. **Environment Variables** in `.env` file:
   ```
   DATABASE_URL=postgresql://postgres:1111@localhost:5432/saudi_towerdb
   PORT=3001
   JWT_SECRET=your-secret-key-change-in-production
   ```

## Verify Server is Running

Open your browser and go to: `http://localhost:3001/health`

You should see:
```json
{
  "status": "ok",
  "database": "connected"
}
```

## Troubleshooting

### Server won't start
1. Check if port 3001 is already in use
2. Verify PostgreSQL is running
3. Check `.env` file exists and has correct DATABASE_URL
4. Look for error messages in the console

### Connection Refused Error
- Make sure the server is running
- Check that port 3001 is not blocked by firewall
- Verify the server started successfully (look for "🚀 API Server running" message)









