import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import { parse } from 'url';

// Read credentials from google_creds.json
const credsPath = join(process.cwd(), 'google_creds.json');
const credsContent = readFileSync(credsPath, 'utf-8');
const creds = JSON.parse(credsContent);

const oauth2Client = new google.auth.OAuth2(
  creds.web.client_id,
  creds.web.client_secret,
  'http://localhost:8080' // Must match one of the redirect URIs
);

// Generate auth URL
const scopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent', // Force consent screen to get refresh token
});

console.log('\n=== Gmail OAuth Setup ===\n');
console.log('1. Open this URL in your browser:');
console.log(authUrl);
console.log('\n2. Authorize the application');
console.log('3. Copy the authorization code from the redirect URL\n');

// Start a temporary server to receive the callback
const server = createServer(async (req, res) => {
  const { query } = parse(req.url || '', true);
  const code = query.code as string;

  if (code) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      
      console.log('\n=== SUCCESS ===\n');
      console.log('Your refresh token:');
      console.log(tokens.refresh_token);
      console.log('\nSet it as an environment variable:');
      console.log(`export GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"`);
      console.log('\nOr add it to your .env file:');
      console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
      
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Success! Check the console for your refresh token.');
    } catch (error) {
      console.error('Error getting token:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error getting token. Check the console.');
    }
    
    server.close();
    process.exit(0);
  } else {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('No authorization code received');
  }
});

server.listen(8080, () => {
  console.log('\nWaiting for authorization... (listening on http://localhost:8080)\n');
});
