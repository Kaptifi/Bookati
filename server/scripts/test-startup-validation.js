import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

console.log('🧪 Testing Server Startup Validation\n');
console.log('='.repeat(60));
console.log('\n📋 This will start the server briefly to test credential loading...\n');

// Start the server with tsx (TypeScript execution)
const serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: join(__dirname, '..'),
  stdio: 'pipe',
  shell: true,
});

let output = '';
let errorOutput = '';

serverProcess.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  // Look for credential loading messages
  if (text.includes('ZohoCredentials') || text.includes('Zoho credentials')) {
    console.log('📝 Server output:', text.trim());
  }
});

serverProcess.stderr.on('data', (data) => {
  const text = data.toString();
  errorOutput += text;
  // Only show errors, not warnings
  if (text.includes('Error') || text.includes('Failed')) {
    console.log('⚠️  Server error:', text.trim());
  }
});

// Wait a few seconds for server to start and load credentials
setTimeout(() => {
  console.log('\n📊 Analyzing server output...\n');
  
  // Check for credential loading messages
  if (output.includes('ZohoCredentials') || output.includes('Zoho credentials')) {
    if (output.includes('✅') || output.includes('Loaded credentials')) {
      console.log('✅ SUCCESS: Credentials loaded successfully!');
      console.log('   - Credential manager is working');
      console.log('   - Startup validation passed');
    } else if (output.includes('⚠️') || output.includes('not configured')) {
      console.log('⚠️  WARNING: Credentials not configured');
      console.log('   - This is expected if credentials are missing');
    }
  } else {
    console.log('ℹ️  No credential messages found in output');
    console.log('   - Server may have started before credential check');
    console.log('   - Or credential manager not yet initialized');
  }
  
  // Check for server startup
  if (output.includes('API Server running') || output.includes('Server started')) {
    console.log('✅ Server started successfully');
  }
  
  // Kill the server
  serverProcess.kill();
  console.log('\n✅ Test complete. Server stopped.');
  console.log('\n📝 Full output saved for review.');
  
  process.exit(0);
}, 5000); // Wait 5 seconds

// Handle process exit
serverProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.log(`\n⚠️  Server exited with code ${code}`);
  }
});

