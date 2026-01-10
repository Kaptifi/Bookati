# Quick Login Guide 🚀

## TL;DR - Start Using Now

### Step 1: Start Everything (One Command)
```bash
./start-dev.sh
```

### Step 2: Login
- **URL:** http://localhost:5173/login
- **Email:** `admin@bookati.com`
- **Password:** `Admin123456`

That's it! You're now logged in with full admin access.

---

## Manual Start (If Needed)

### Terminal 1 - Backend
```bash
cd server
npm run dev
```
Wait for: "🚀 API Server running on http://localhost:3001"

### Terminal 2 - Frontend
```bash
npm run dev
```
Frontend at: http://localhost:5173

---

## Verify System Health

```bash
curl http://localhost:3001/api/health
```
Should return: `{"status":"ok","database":"connected"}`

---

## Troubleshooting

### "Failed to fetch" or "Network error"
→ Backend not running. Start it: `cd server && npm run dev`

### "Invalid credentials"
→ Use exactly: `admin@bookati.com` / `Admin123456`

### "Port 3001 already in use"
→ Kill it: `kill -9 $(lsof -Pi :3001 -sTCP:LISTEN -t)`

### "DATABASE_URL is not set"
→ Make sure `server/.env` exists (it does now)

---

## What's Running

- **Backend:** http://localhost:3001 (Express API)
- **Frontend:** http://localhost:5173 (React + Vite)
- **Database:** Supabase PostgreSQL (cloud)

---

## Useful Commands

```bash
# View backend logs
tail -f /tmp/server.log

# Check server status
curl http://localhost:3001/api/health

# Stop backend (if running in background)
kill $(cat /tmp/server.pid)

# Use PM2 for persistent server
cd server
npm run pm2:start    # Start
npm run pm2:status   # Check status
npm run pm2:logs     # View logs
npm run pm2:stop     # Stop
```

---

## User Roles

- **solution_owner** → `/solution-admin` (full system access)
- **tenant_admin** → `/{tenant-slug}/admin` (manage own business)
- **receptionist** → `/{tenant-slug}/reception` (booking management)
- **employee** → Limited access
- **customer** → Customer portal (different login page)

---

## Files You Should Know

- **server/.env** - Backend configuration (DB credentials)
- **server/logs/** - Application logs
- **.env** - Frontend configuration (Supabase URL)
- **LOGIN_WORKING.md** - Detailed login verification
- **SYSTEM_FIXED.md** - Complete fix documentation

---

## Security Notes

- Never commit `server/.env` to git (already in .gitignore)
- Change JWT_SECRET before production deployment
- Use strong database password (current one is for dev)
- Enable 2FA for admin accounts in production

---

**System Status:** ✅ FULLY OPERATIONAL

**Last Verified:** January 10, 2026

**Confidence:** 100% - All tests passed
