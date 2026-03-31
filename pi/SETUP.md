# Pi Bridge Setup

## 1. Prerequisites on the printer

Enable LAN mode on the P1S touchscreen:
`Settings → Network → LAN Mode Liveview → Enable`

Note down:
- **Access Code** — shown on the same Network settings screen
- **Serial Number** — Settings → About
- **Printer IP** — Settings → Network (assign a static DHCP lease in your router for reliability)

## 2. Set up the Pi

```bash
# Create working directory
mkdir -p ~/printfarm/files
cd ~/printfarm

# Copy project files
cp -r /path/to/PrintFarmCompanion/pi/* .

# Create virtualenv and install deps
python3 -m venv venv
venv/bin/pip install -r requirements.txt

# Configure environment
cp .env.example .env
nano .env   # fill in WEBHOOK_URL and WEBHOOK_SECRET
```

## 3. Install as a systemd service

```bash
sudo cp printfarm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable printfarm
sudo systemctl start printfarm

# Check it's running
sudo systemctl status printfarm
curl http://localhost:8000/health
```

## 4. Set up Cloudflare Tunnel

```bash
# Install cloudflared (ARM for Pi 3/4)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Authenticate (opens browser on your machine — copy the URL)
cloudflared tunnel login

# Create the tunnel
cloudflared tunnel create printfarm

# Note the tunnel ID from the output, then create config:
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOF
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /home/pi/.cloudflared/<YOUR_TUNNEL_ID>.json
ingress:
  - hostname: pi.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
EOF

# Route DNS (requires your domain to be on Cloudflare)
cloudflared tunnel route dns printfarm pi.yourdomain.com

# Install tunnel as a service
sudo cloudflared service install
sudo systemctl start cloudflared
```

## 5. Configure CF Workers

Add to your `wrangler.toml` (or set via Cloudflare dashboard):
```toml
[vars]
PI_TUNNEL_URL = "https://pi.yourdomain.com"
PI_WEBHOOK_SECRET = "same-value-as-in-.env"
```

## 6. Configure printers in the app

In Print Farm Companion Settings → Printers → Edit each printer:
- **Printer IP**: e.g. `192.168.1.50`
- **Serial Number**: from printer touchscreen
- **Access Code**: from printer touchscreen (Network settings)

Once all three are set, that printer shows "Pi-capable" and the Start Print (Pi) flow is enabled.

## 7. Verify end-to-end

```bash
# Pi health
curl http://localhost:8000/health
curl https://pi.yourdomain.com/health

# Upload a test file
curl -X POST https://pi.yourdomain.com/upload \
  -F "file=@/path/to/test.gcode.3mf"
```
