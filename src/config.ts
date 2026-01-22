import { readFileSync } from 'fs';
import { join } from 'path';

export interface Config {
  gmail: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  ai: {
    provider: 'openai' | 'ollama';
    openaiApiKey?: string;
    ollamaUrl: string;
    ollamaModel: string;
  };
  sheets: {
    spreadsheetId: string;
  };
  processing: {
    pollIntervalMinutes: number;
    processedLabel: string;
    useInMemoryTracking: boolean;
    dryRun: boolean;
  };
}

interface GoogleCreds {
  web?: {
    client_id: string;
    client_secret: string;
  };
  installed?: {
    client_id: string;
    client_secret: string;
  };
}

/**
 * Extracts the spreadsheet ID from a Google Sheets URL or returns the ID if already provided.
 * Supports URLs like:
 * - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
 * - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?usp=sharing
 * - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
 */
function extractSpreadsheetId(urlOrId: string): string {
  // If it's already just an ID (no slashes or protocol), return as-is
  if (!urlOrId.includes('/') && !urlOrId.includes('://')) {
    return urlOrId;
  }

  // Try to extract ID from URL
  // Pattern: /d/SPREADSHEET_ID/ or /d/SPREADSHEET_ID? or /d/SPREADSHEET_ID#
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }

  // If we can't parse it, throw an error
  throw new Error(
    `Invalid Google Sheets URL or ID: ${urlOrId}\n` +
    `Expected format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit or just SPREADSHEET_ID`
  );
}

export function loadConfig(): Config {
  // Try to load from google_creds.json first
  let gmailClientId: string | undefined;
  let gmailClientSecret: string | undefined;
  
  try {
    const credsPath = join(process.cwd(), 'google_creds.json');
    const credsContent = readFileSync(credsPath, 'utf-8');
    const creds: GoogleCreds = JSON.parse(credsContent);
    
    const webCreds = creds.web || creds.installed;
    if (webCreds) {
      gmailClientId = webCreds.client_id;
      gmailClientSecret = webCreds.client_secret;
    }
  } catch (error) {
    // File doesn't exist or can't be read, fall back to env vars
    console.log('google_creds.json not found, using environment variables');
  }

  // Fall back to environment variables if not found in file
  gmailClientId = gmailClientId || process.env.GMAIL_CLIENT_ID;
  gmailClientSecret = gmailClientSecret || process.env.GMAIL_CLIENT_SECRET;
  const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!gmailClientId || !gmailClientSecret || !gmailRefreshToken) {
    throw new Error(
      'Missing required Gmail OAuth credentials.\n' +
      'Either:\n' +
      '  1. Create google_creds.json with client_id and client_secret, and set GMAIL_REFRESH_TOKEN env var\n' +
      '  2. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables'
    );
  }

  const aiProvider = (process.env.AI_PROVIDER || 'ollama') as 'openai' | 'ollama';
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (aiProvider === 'openai' && !openaiApiKey) {
    throw new Error('AI_PROVIDER is set to "openai" but OPENAI_API_KEY is not set');
  }

  return {
    gmail: {
      clientId: gmailClientId,
      clientSecret: gmailClientSecret,
      refreshToken: gmailRefreshToken,
    },
    ai: {
      provider: aiProvider,
      openaiApiKey,
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
      ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    },
    sheets: {
      spreadsheetId: extractSpreadsheetId(
        process.env.GOOGLE_SHEETS_URL || 
        process.env.GOOGLE_SHEETS_ID || 
        '1T9vwarXB3ICksZpP4gHw-rllKve0j2tKBDEEEsIVEAM'
      ),
    },
    processing: {
      pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '5', 10),
      processedLabel: process.env.PROCESSED_LABEL || '[Superhuman]/ai/processed',
      useInMemoryTracking: process.env.USE_IN_MEMORY_TRACKING === 'true',
      dryRun: process.env.DRY_RUN === 'true',
    },
  };
}
