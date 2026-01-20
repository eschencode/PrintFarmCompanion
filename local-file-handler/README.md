# local-file-handler
# 🚀 Quick Start Guide 

## Step 1: Generate Token 

```bash
cd local-file-handler
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output.

## Step 2: Create .env File 

```bash
echo "AUTH_TOKEN=paste_your_token_here" > .env
```

## Step 3: Update Allowed Directories 

Edit `server.js` line 16:

```javascript
const ALLOWED_DIRECTORIES = [
  '/Users/YOUR_USERNAME/Documents/3d-models',  // CHANGE THIS TO WHERE YOU STORE YOUR FILES
];
```

## Step 4: Install & Start 

```bash
bun install
bun run start
```

Keep this terminal open!

## Step 5: Configure Dashboard 

1. Open your Print Farm dashboard
2. Go to **Settings**
3. Find **Local File Handler Configuration**
4. Paste your token from Step 1
5. Click **Save Token**
6. Click **Test Connection** - should be green ✅

## Done! 🎉

Now when you start a print, the file will automatically open!

NOTE: Recomended to add auto start for the file handler on boot.
---
