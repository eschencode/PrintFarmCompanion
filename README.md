
npx drizzle-lab@latest visualizer
Drizzle Visualizer is up and running on http://127.0.0.1:64738



# 🖨️ Print Farm Companion

A modern, full-stack web application for managing a 3D print farm. Track printers, spools, print jobs, and analyze production statistics — all from a beautiful dark-themed dashboard.

![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&logo=svelte&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat&logo=cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![D1 Database](https://img.shields.io/badge/Cloudflare_D1-F38020?style=flat&logo=cloudflare&logoColor=white)

---


![dashboardView](/static/images/screen.png)

## ✨ Features

### 📊 Dashboard
- **3x3 Grid Layout** — Visual overview of all printers at a glance
- **Real-time Status Indicators**:
  - 🔵 Blue (pulsing) — Actively printing
  - 🟣 Purple (pulsing) — Print time complete, ready for inspection
  - 🟢 Green — Idle with enough filament for compatible modules
  - 🟡 Yellow — Idle but low/no filament for compatible modules
- **Progress Bars** — Live print progress on each printer card
- **Quick Actions** — Click any printer to load spools, start prints, or mark jobs complete

### 🎯 Smart Print Management
- **Module-Based Printing** — Define reusable print modules with expected weight, time, and spool compatibility
- **Spool Preset System** — Create presets for your filament types (brand, material, color, cost)
- **Intelligent Matching** — Only shows modules compatible with the currently loaded spool
- **Optimal Combination Calculator** — Suggests the best module combination to minimize filament waste

### 📈 Statistics & Analytics
- **Print History Charts** — Track prints over the last 30/90 days
- **Material Usage Tracking** — Monitor filament consumption
- **Success/Failure Rates** — Pie charts showing print reliability
- **Failure Reason Breakdown** — Identify common issues
- **Printer Utilization** — See total hours per printer
- **Cost Tracking** — Track material costs per module, color, and product set

### ⚙️ Settings
- **Print Module Management** — Add/edit/delete print modules with images
- **Spool Preset Configuration** — Manage your filament inventory
- **Local File Handler** — Automatically open .3mf files when starting prints (macOS)

---

## 🚀 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | SvelteKit 2.0, Svelte 5, TailwindCSS |
| **Backend** | SvelteKit Server Routes, Cloudflare Workers |
| **Database** | Cloudflare D1 (SQLite) |
| **Charts** | Apache ECharts |
| **Hosting** | Cloudflare Pages |
| **Local Tools** | Node.js/Bun (File Handler) |

---

## 📦 Installation

### Prerequisites
- [Bun](https://bun.sh/) or Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (for Cloudflare D1)

### 1. Clone the Repository
```bash
git clone https://github.com/eschencode/PrintFarmCompanion.git
cd PrintFarmCompanion
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Set Up the Database
```bash
# Create D1 database
wrangler d1 create printfarm-db

# Update wrangler.jsonc with your database ID

# Run migrations
wrangler d1 execute printfarm-db --local --file=schema.sql
wrangler d1 execute printfarm-db --local --file=seed.sql
```

### 4. Run Development Server
```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🌐 Deployment

### Deploy to Cloudflare Pages
```bash
bun run build
wrangler pages deploy .svelte-kit/cloudflare
```

### Environment Setup
Make sure your D1 database binding is configured in `wrangler.jsonc`:
```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "printfarm-db",
      "database_id": "your-database-id"
    }
  ]
}
```

---

## 🖥️ Local File Handler (Optional)

Automatically open 3D model files when you start a print job.

```bash
cd local-file-handler
bun install
bun run start
```

See [local-file-handler/README.md](local-file-handler/README.md) for full setup instructions.

---

## 📁 Project Structure

```
├── src/
│   ├── lib/
│   │   ├── server.ts          # Database functions
│   │   ├── stores/            # Svelte stores
│   │   └── assets/            # Images, icons
│   └── routes/
│       ├── +page.svelte       # Dashboard
│       ├── +page.server.ts    # Dashboard API
│       ├── settings/          # Settings page
│       └── stats/             # Statistics page
├── static/
│   └── images/                # Module images
├── migrations/                # SQL migrations
├── local-file-handler/        # File opener service
├── schema.sql                 # Database schema
├── seed.sql                   # Initial data
└── wrangler.jsonc             # Cloudflare config
```

---

## 🎨 Status Indicator Legend

| Color | Status | Meaning |
|-------|--------|---------|
| 🔵 Blue (pulsing) | Printing | Active print in progress |
| 🟣 Purple (pulsing) | Complete | Print time elapsed, ready for inspection |
| 🟢 Green | Ready | Idle with sufficient filament |
| 🟡 Yellow | Low Material | Idle, no compatible modules can be printed |
| ⚫ Gray | Offline | Printer unavailable |

---

## 🛠️ Development

```bash
# Start dev server
bun run dev

# Type check
bun run check

# Lint
bun run lint

# Build for production
bun run build

# Preview production build
bun run preview
```

---

## 📝 License

MIT License — feel free to use this project for your own print farm!

---

## 🙏 Acknowledgments

- [SvelteKit](https://kit.svelte.dev/) — Amazing full-stack framework
- [Cloudflare](https://cloudflare.com/) — Edge hosting & D1 database
- [Apache ECharts](https://echarts.apache.org/) — Beautiful charts
- [TailwindCSS](https://tailwindcss.com/) — Utility-first CSS

---

**Happy Printing! 🖨️✨**
