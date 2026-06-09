const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

const OBSIDIAN_PORT = 27124;
const TOKEN = process.env.OBSIDIAN_TOKEN;
const FILES_TO_SYNC = ['status.md', 'agents.md'];
const PROJECT_ROOT = path.resolve(__dirname, '..');

if (!TOKEN) {
  console.log('Skipping Obsidian synchronization (OBSIDIAN_TOKEN is not configured).');
  process.exit(0);
}

// Create custom HTTPS agent to allow self-signed certificates (equivalent to curl -k)
const agent = new https.Agent({
  rejectUnauthorized: false
});

function uploadFile(fileName) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(PROJECT_ROOT, fileName);
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const fileContent = fs.readFileSync(filePath);
    
    const options = {
      hostname: '127.0.0.1',
      port: OBSIDIAN_PORT,
      path: `/vault/NailsProject/${fileName}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'text/markdown',
        'Content-Length': fileContent.length
      },
      agent: agent
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✓ ${fileName} successfully synchronized with Obsidian`);
          resolve();
        } else {
          reject(new Error(`Failed to upload ${fileName}. Status: ${res.statusCode}. Response: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(fileContent);
    req.end();
  });
}

async function main() {
  console.log('Starting synchronization with Obsidian...');
  let success = true;
  for (const file of FILES_TO_SYNC) {
    try {
      await uploadFile(file);
    } catch (error) {
      console.error(`✗ Error synchronizing ${file}:`, error.message);
      success = false;
    }
  }
  process.exit(success ? 0 : 1);
}

main();
