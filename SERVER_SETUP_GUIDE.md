# Backend Server Setup Guide

The backend server has been successfully downloaded and configured from the GitHub repository.

## Configuration Required

You need to update the database password in the server's `.env` file:

1. Open `server/.env`
2. Find this line:
   ```
   DATABASE_URL=postgresql://postgres.lozuyxxgqtdvqkyjajuo:your-db-password@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```
3. Replace `your-db-password` with your actual Supabase database password

**To get your Supabase database password:**
- Go to your Supabase project dashboard
- Navigate to Project Settings > Database
- Under "Connection string" section, select "URI" mode
- Copy the password from the connection string (or use the password you set when creating the project)

## Starting the Server

### Option 1: Command Line
```bash
cd server
npm run dev
```

### Option 2: Windows Batch File
Double-click `server/start-server.bat`

## Verify Server is Running

1. The terminal should show: `🚀 API Server running on http://localhost:3001`
2. Open your browser and visit: `http://localhost:3001/health`
3. You should see:
   ```json
   {
     "status": "ok",
     "database": "connected"
   }
   ```

## Test Login

Once the server is running:
1. Go to your frontend at `/login`
2. Enter credentials:
   - Email: `hatem@techflipp.com`
   - Password: `Hatem@123`
3. You should be redirected to the Techflipp admin dashboard

## Troubleshooting

### "Failed to fetch" or Network Error
- The server is not running. Start it using the commands above.

### "Database connection failed"
- Check your DATABASE_URL in `server/.env`
- Verify your Supabase database password is correct
- Ensure your IP is allowed in Supabase project settings

### Port 3001 already in use
- Stop any other process using port 3001
- Or change PORT in `server/.env` (also update VITE_API_URL in frontend `.env`)

## What Changed

The frontend authentication has been updated to use your backend API:
- All login requests go to `http://localhost:3001/api/auth/signin`
- The backend validates credentials and returns user, tenant, and session data
- Tokens are managed by the backend server
