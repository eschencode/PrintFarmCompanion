const express = require('express');
const { exec } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());

// ============================================================================
// CONFIGURATION
// ============================================================================

// Generate or load authentication token
const AUTH_TOKEN = process.env.AUTH_TOKEN || crypto.randomBytes(32).toString('hex');

// Whitelist of allowed directories - UPDATE THESE TO YOUR ACTUAL PATHS
const ALLOWED_DIRECTORIES = [
  '/Users/linus/Documents/3d-models',
  '/Users/linus/Downloads/prints',
  // Add more directories as needed
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.3mf', '.gcode', '.stl', '.obj'];

// Server configuration
const PORT = 3001;
const HOST = '127.0.0.1'; // localhost only for security

// ============================================================================
// MIDDLEWARE - SECURITY LAYERS
// ============================================================================

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  console.log(`[${timestamp}] ${req.method} ${req.path} from ${ip}`);
  next();
});

// Security Layer 1: Localhost only
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const isLocalhost = ip.includes('127.0.0.1') || 
                      ip.includes('::1') || 
                      ip.includes('::ffff:127.0.0.1');
  
  if (!isLocalhost) {
    console.error(`❌ Access denied from ${ip}`);
    return res.status(403).json({ error: 'Access denied - localhost only' });
  }
  next();
});

// Security Layer 2: Authentication token (except health check)
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  
  const token = req.headers['x-auth-token'];
  if (!token || token !== AUTH_TOKEN) {
    console.error('❌ Invalid or missing auth token');
    return res.status(401).json({ error: 'Unauthorized - invalid token' });
  }
  next();
});

// CORS - only allow requests from your app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// ============================================================================
// ENDPOINTS
// ============================================================================

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    platform: process.platform,
    secure: true,
    allowedDirectories: ALLOWED_DIRECTORIES.length,
    timestamp: new Date().toISOString()
  });
});

// Main file opener endpoint
app.post('/open-file', (req, res) => {
  const { filePath, moduleName, printerId } = req.body;
  
  // Validation: filePath is required
  if (!filePath) {
    console.error('❌ Missing filePath in request');
    return res.status(400).json({ error: 'filePath is required' });
  }
  
  // Normalize the path to prevent directory traversal attacks
  const normalizedPath = path.normalize(filePath);
  
  // Security Check 1: Whitelist directories
  const isInAllowedDirectory = ALLOWED_DIRECTORIES.some(dir => 
    normalizedPath.startsWith(path.normalize(dir))
  );
  
  if (!isInAllowedDirectory) {
    console.error(`❌ Blocked unauthorized path: ${normalizedPath}`);
    console.error(`   Allowed directories: ${ALLOWED_DIRECTORIES.join(', ')}`);
    return res.status(403).json({ 
      error: 'Path not in allowed directories',
      path: normalizedPath,
      allowedDirs: ALLOWED_DIRECTORIES
    });
  }
  
  // Security Check 2: File must exist
  if (!fs.existsSync(normalizedPath)) {
    console.error(`❌ File not found: ${normalizedPath}`);
    return res.status(404).json({ 
      error: 'File not found',
      path: normalizedPath
    });
  }
  
  // Security Check 3: File extension validation
  const fileExtension = path.extname(normalizedPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
    console.error(`❌ Invalid file type: ${fileExtension}`);
    return res.status(400).json({ 
      error: 'Invalid file type',
      extension: fileExtension,
      allowed: ALLOWED_EXTENSIONS
    });
  }
  
  // Security Check 4: Must be a file, not a directory
  const stats = fs.statSync(normalizedPath);
  if (!stats.isFile()) {
    console.error(`❌ Path is not a file: ${normalizedPath}`);
    return res.status(400).json({ error: 'Path must be a file, not a directory' });
  }
  
  // All checks passed - open the file
  console.log(`📂 Opening file for Printer ${printerId || 'unknown'}:`);
  console.log(`   Module: ${moduleName || 'Unknown'}`);
  console.log(`   Path: ${normalizedPath}`);
  
  // Determine the correct open command based on OS
  let openCommand;
  switch (process.platform) {
    case 'darwin':  // macOS
      openCommand = 'open';
      break;
    case 'win32':   // Windows
      openCommand = 'start ""';
      break;
    case 'linux':   // Linux
      openCommand = 'xdg-open';
      break;
    default:
      console.error(`❌ Unsupported platform: ${process.platform}`);
      return res.status(500).json({ error: 'Unsupported operating system' });
  }
  
  // Execute the command to open the file
  exec(`${openCommand} "${normalizedPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Error opening file:', error.message);
      if (stderr) console.error('   stderr:', stderr);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
    
    console.log('✅ File opened successfully');
    if (stdout) console.log('   stdout:', stdout);
    
    res.json({ 
      success: true,
      message: 'File opened',
      module: moduleName,
      path: normalizedPath
    });
  });
});

// Test endpoint (requires auth)
app.post('/test', (req, res) => {
  console.log('🧪 Test endpoint called');
  res.json({ 
    message: 'Authentication successful!',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, HOST, () => {
  console.log('\n' + '='.repeat(70));
  console.log('🖨️  3D PRINT FARM - LOCAL FILE HANDLER');
  console.log('='.repeat(70));
  console.log(`📡 Server running on http://${HOST}:${PORT}`);
  console.log(`🔒 Security: Localhost only + Auth token`);
  console.log(`📁 Allowed directories (${ALLOWED_DIRECTORIES.length}):`);
  ALLOWED_DIRECTORIES.forEach(dir => console.log(`   - ${dir}`));
  console.log(`📄 Allowed file types: ${ALLOWED_EXTENSIONS.join(', ')}`);
  console.log(`🖥️  Platform: ${process.platform}`);
  console.log('='.repeat(70));
  
  if (!process.env.AUTH_TOKEN) {
    console.log('\n⚠️  WARNING: No AUTH_TOKEN found in .env file');
    console.log('🔐 Generated temporary token for this session:');
    console.log(`\nAUTH_TOKEN=${AUTH_TOKEN}\n`);
    console.log('💡 Save this to your .env file to persist across restarts');
    console.log('='.repeat(70));
  } else {
    console.log('✅ Using AUTH_TOKEN from .env file');
    console.log('='.repeat(70));
  }
  
  console.log('\n✨ Ready to handle file open requests!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});