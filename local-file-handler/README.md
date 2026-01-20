# 🖨️ Local File Handler

Automatically opens 3D print files on your Mac when you start a print job from the dashboard.

---

## 🚀 Quick Start

### Step 1: Generate Token
```bash
cd local-file-handler
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output.

### Step 2: Create .env File
```bash
echo "AUTH_TOKEN=paste_your_token_here" > .env
```

### Step 3: Update Allowed Directories
Edit `server.js` line ~16:
```javascript
const ALLOWED_DIRECTORIES = [
  '/Users/YOUR_USERNAME/Documents/3d-models',  // CHANGE THIS
];
```

### Step 4: Install & Start
```bash
bun install
bun run start
```
Keep this terminal open!

### Step 5: Configure Dashboard
1. Open your Print Farm dashboard
2. Go to **Settings**
3. Find **Local File Handler Configuration**
4. Paste your token from Step 1
5. Click **Save Token**
6. Click **Test Connection** → should show ✅ green

---

## 🤖 Auto-Start (Recommended)

See **[AUTOSTART.md](AUTOSTART.md)** for macOS LaunchAgent setup.

**TL;DR:**
```bash
mkdir -p ~/Library/LaunchAgents
cp launchagent.example ~/Library/LaunchAgents/com.printfarm.handler.plist
launchctl load ~/Library/LaunchAgents/com.printfarm.handler.plist
```

---

## 🧪 Testing

### Health Check
```bash
curl http://127.0.0.1:3001/health
```

### Authentication Test
```bash
curl -X POST http://127.0.0.1:3001/test \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: YOUR_TOKEN_HERE"
```

### Full Test Suite
```bash
bun run test
```

---

## 🔒 Security Features

- ✅ Localhost only (127.0.0.1)
- ✅ Authentication token required
- ✅ Path whitelisting
- ✅ File type validation
- ✅ CORS protection

---

## 🐛 Troubleshooting

### Connection Failed
```bash
# Check if running
curl http://127.0.0.1:3001/health

# Check logs (if using LaunchAgent)
tail -f /tmp/printfarm-handler.log
tail -f /tmp/printfarm-handler-error.log

# Restart
launchctl unload ~/Library/LaunchAgents/com.printfarm.handler.plist
launchctl load ~/Library/LaunchAgents/com.printfarm.handler.plist
```

### Files Not Opening
1. Check file path is absolute: `/Users/username/Documents/file.3mf`
2. Check path is in `ALLOWED_DIRECTORIES` (server.js)
3. Check file exists: `ls -la /path/to/file.3mf`
4. Check server logs for errors

### Port Already in Use
```bash
# Find what's using port 3001
lsof -i :3001

# Kill it
kill -9 <PID>
```

---

## 📝 Configuration

### Environment Variables (.env)
```env
AUTH_TOKEN=your_secure_token_here
# PORT=3001          # Optional: change port
# HOST=127.0.0.1     # Optional: change host
```

### Allowed Directories (server.js)
```javascript
const ALLOWED_DIRECTORIES = [
  '/Users/linus/Documents/3d-models',
  '/Users/linus/Downloads/prints',
];
```

### Allowed File Types (server.js)
```javascript
const ALLOWED_EXTENSIONS = ['.3mf', '.gcode', '.stl', '.obj'];
```

---

## 📁 Project Structure

```
local-file-handler/
├── server.js              # Main server
├── test.js               # Test suite
├── package.json          # Dependencies
├── .env                  # Config (DON'T COMMIT)
├── .env.example          # Template
├── launchagent.example   # Auto-start template
├── README.md             # This file
└── AUTOSTART.md          # Auto-start guide
```

---

## 🛠️ Development

```bash
bun run start    # Start server
bun run dev      # Same as start
bun run test     # Run tests
```

---

## 📞 Support

1. Check [Troubleshooting](#-troubleshooting)
2. Check logs: `/tmp/printfarm-handler.log`
3. Test with curl commands above
4. Verify configuration matches this guide

---

**Happy Printing! 🖨️✨**