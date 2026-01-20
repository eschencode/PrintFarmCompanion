# 🤖 Auto-Start Setup (macOS)

## Quick Install

### 1. Create LaunchAgents directory (if needed)
```bash
mkdir -p ~/Library/LaunchAgents
```

### 2. Copy the LaunchAgent file
```bash
cp launchagent.example ~/Library/LaunchAgents/com.printfarm.handler.plist
```

### 3. Load it
```bash
launchctl load ~/Library/LaunchAgents/com.printfarm.handler.plist
```

### 4. Verify it's running
```bash
launchctl list | grep printfarm
```

You should see: `com.printfarm.handler`

### 5. Check logs
```bash
tail -f /tmp/printfarm-handler.log
```

Press `Ctrl+C` to stop viewing.

---

## ✅ Done!

The file handler will now:
- Start automatically on login
- Restart if it crashes
- Run in background (no terminal window)

---

## Useful Commands

### Stop the handler
```bash
launchctl unload ~/Library/LaunchAgents/com.printfarm.handler.plist
```

### Start it again
```bash
launchctl load ~/Library/LaunchAgents/com.printfarm.handler.plist
```

### Restart (stop + start)
```bash
launchctl unload ~/Library/LaunchAgents/com.printfarm.handler.plist
launchctl load ~/Library/LaunchAgents/com.printfarm.handler.plist
```

### Check if running
```bash
launchctl list | grep printfarm
```

### View logs
```bash
tail -f /tmp/printfarm-handler.log
```

### View error logs
```bash
tail -f /tmp/printfarm-handler-error.log
```

### Test if it's working
```bash
curl http://127.0.0.1:3001/health
```

---

## 🔧 Customization

If you need to change paths, edit:
```bash
nano ~/Library/LaunchAgents/com.printfarm.handler.plist
```

Then reload:
```bash
launchctl unload ~/Library/LaunchAgents/com.printfarm.handler.plist
launchctl load ~/Library/LaunchAgents/com.printfarm.handler.plist
```