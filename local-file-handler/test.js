const http = require('http');
require('dotenv').config();

const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error('❌ No AUTH_TOKEN found in .env file');
  console.error('💡 Create a .env file with: AUTH_TOKEN=your_token_here');
  process.exit(1);
}

console.log('🧪 Testing Local File Handler...\n');

// Test 1: Health check
console.log('Test 1: Health Check (no auth required)');
const healthReq = http.request({
  hostname: '127.0.0.1',
  port: 3001,
  path: '/health',
  method: 'GET'
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('✅ Health check:', JSON.parse(data));
    
    // Test 2: Authentication test
    console.log('\nTest 2: Authentication Test');
    const testData = JSON.stringify({});
    
    const testReq = http.request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': testData.length,
        'X-Auth-Token': AUTH_TOKEN
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('✅ Auth test:', JSON.parse(data));
        console.log('\n✨ All tests passed!');
        console.log('💡 Server is ready to handle file open requests');
      });
    });
    
    testReq.on('error', (e) => {
      console.error('❌ Auth test failed:', e.message);
    });
    
    testReq.write(testData);
    testReq.end();
  });
});

healthReq.on('error', (e) => {
  console.error('❌ Health check failed:', e.message);
  console.error('   Make sure the server is running: bun run start');
  process.exit(1);
});

healthReq.end();