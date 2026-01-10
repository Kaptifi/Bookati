# Quick Start Guide

## The Server is Already Running!

Your backend server is currently running on port 3001 and working correctly.

## Test Login Now

1. **Open your browser** to http://localhost:5173/login

2. **Use test credentials:**
   - Any valid user credentials in your database
   - Server will respond properly now

3. **Check server status:**
   ```bash
   curl http://localhost:3001/api/health
   ```
   Should return: `{"status":"ok","database":"connected"}`

## Server Management

### Check if Server is Running
```bash
ps aux | grep "tsx src/index.ts"
```

### View Server Logs
```bash
tail -f /tmp/server.log
```

### Restart Server
```bash
# Kill current server
kill $(cat /tmp/server.pid)

# Start new server
cd server
npm run dev > /tmp/server.log 2>&1 &
echo $! > /tmp/server.pid
```

### Use PM2 (Auto-restart on crash)
```bash
cd server
npm run pm2:start    # Start with PM2
npm run pm2:logs     # View logs
npm run pm2:status   # Check status
npm run pm2:stop     # Stop server
```

## What Was Fixed

✅ **Server no longer crashes** on database errors
✅ **Environment variables persist** (.env file won't disappear)
✅ **Database connection tested** before server starts
✅ **Global error handlers** prevent crashes
✅ **Background jobs wrapped** in error handlers
✅ **PM2 configured** for auto-restart

## Verify Everything Works

1. **Backend Health:**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Login Endpoint:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/signin \
     -H 'Content-Type: application/json' \
     -d '{"email":"test@example.com","password":"test123","forCustomer":false}'
   ```

3. **Check Logs:**
   ```bash
   tail -20 /tmp/server.log
   ```

## Common Commands

```bash
# Frontend
npm run dev              # Start frontend dev server
npm run build            # Build for production

# Backend
cd server
npm run dev              # Development with auto-reload
npm run pm2:start        # Production with PM2
npm run pm2:logs         # View PM2 logs
npm run pm2:status       # Check PM2 status
npm run pm2:restart      # Restart PM2 server
```

## If Login Still Fails

1. Check browser console for errors
2. Verify server is running: `curl http://localhost:3001/api/health`
3. Check server logs: `tail -f /tmp/server.log`
4. Verify .env file exists: `ls -la server/.env`
5. Test database connection: `curl http://localhost:3001/api/health`

## Need Help?

- See `LOGIN_FIX_SUMMARY.md` for detailed technical explanation
- Check `server/logs/` for PM2 logs (if using PM2)
- Check `/tmp/server.log` for development logs

---

**The server is stable now. Login should work!** 🎉
