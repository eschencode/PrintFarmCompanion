# PrintFarm Pi Bridge — Setup & Cheat Sheet

Runs on the Raspberry Pi. Receives print jobs from the Cloudflare Workers backend, uploads `.gcode.3mf` files to Bambu printers via FTPS, and sends MQTT print commands. Reports live status back via webhook.

---

## Quick Reference

### Check status
```bash
sudo systemctl status printfarm cloudflared
```

### Live logs
```bash
# Follow printfarm server logs (Ctrl+C to stop)
journalctl -fu printfarm

# Follow cloudflared tunnel logs
journalctl -fu cloudflared

# Both at once
journalctl -fu printfarm & journalctl -fu cloudflared
```

### Recent logs
```bash
journalctl -u printfarm --since "1 hour ago" --no-pager
journalctl -u printfarm --since "today" --no-pager
```

### Restart services
```bash
sudo systemctl restart printfarm
sudo systemctl restart cloudflared
sudo systemctl restart printfarm cloudflared   # both at once
```

### Stop / disable
```bash
sudo systemctl stop printfarm cloudflared
sudo systemctl disable printfarm cloudflared   # won't start on reboot
```

### Test the server locally
```bash
curl http://localhost:8000/health
```

### Test through the tunnel
```bash
curl https://pi.printfarm.tech/health
```

---

## Files

```
pi/
├── main.py              # FastAPI server — HTTP endpoints
├── bambu_client.py      # FTPS upload + MQTT print command logic
├── printfarm.service    # systemd unit for the uvicorn server
├── cloudflared.service  # systemd unit for the Cloudflare tunnel
└── .env                 # Environment variables (not in git)
```

### `.env` format
```
FILES_DIR=/home/linus/printfarm/files
WEBHOOK_URL=https://your-cf-pages-url/api/pi/webhook
WEBHOOK_SECRET=your-secret-here
```

---

## First-Time Setup

### 1. Clone and install dependencies
```bash
cd ~
git clone <repo-url> printfarm
cd printfarm
python3 -m venv venv
source venv/bin/activate
pip install -r pi/requirements.txt
```

### 2. Create the `.env` file
```bash
cat > /home/linus/printfarm/.env << 'EOF'
FILES_DIR=/home/linus/printfarm/files
WEBHOOK_URL=https://your-cf-pages-url/api/pi/webhook
WEBHOOK_SECRET=
EOF
```

### 3. Set up the Cloudflare tunnel
```bash
# Log in to Cloudflare (opens browser URL — paste it in)
cloudflared tunnel login

# Create the named tunnel
cloudflared tunnel create pi-farm

# Route your subdomain to it
cloudflared tunnel route dns pi-farm pi.printfarm.tech
```
> The tunnel credentials JSON is saved to `~/.cloudflared/`. Keep it safe.

### 4. Install systemd services
```bash
sudo cp ~/printfarm/pi/printfarm.service /etc/systemd/system/
sudo cp ~/printfarm/pi/cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable printfarm cloudflared
sudo systemctl start printfarm cloudflared
```

### 5. Verify
```bash
sudo systemctl status printfarm cloudflared
curl http://localhost:8000/health
curl https://pi.printfarm.tech/health
```

---

## Updating the Pi Code

After pushing changes on your Mac:
```bash
# On Mac — copy updated files to Pi
scp pi/bambu_client.py pi/main.py linus@192.168.178.210:~/printfarm/pi/

# On Pi — restart the server to pick up changes
sudo systemctl restart printfarm
```

If you changed a service file:
```bash
# On Mac
scp pi/printfarm.service linus@192.168.178.210:~/printfarm/pi/
scp pi/cloudflared.service linus@192.168.178.210:~/printfarm/pi/

# On Pi
sudo cp ~/printfarm/pi/printfarm.service /etc/systemd/system/
sudo cp ~/printfarm/pi/cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart printfarm cloudflared
```

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| `printfarm` won't start | `journalctl -xeu printfarm --no-pager` — usually missing `.env` or wrong venv path |
| `cloudflared` won't start | `journalctl -xeu cloudflared --no-pager` — check `~/.cloudflared/` has tunnel credentials |
| Print not starting on printer | Check printfarm logs for `[MQTT]` lines — look for `print_error` value |
| 502 from `pi.printfarm.tech` | `curl localhost:8000/health` — is printfarm running? |
| Tunnel connected but 502 | Make sure cloudflared service has `--url http://localhost:8000` in ExecStart |
