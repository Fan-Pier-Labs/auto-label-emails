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
  };
}

export function loadConfig(): Config {
  const gmailClientId = process.env.GMAIL_CLIENT_ID;
  const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
  const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!gmailClientId || !gmailClientSecret || !gmailRefreshToken) {
    throw new Error('Missing required Gmail OAuth credentials. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN');
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
      ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:1b',
    },
    sheets: {
      spreadsheetId: process.env.GOOGLE_SHEETS_ID || '1T9vwarXB3ICksZpP4gHw-rllKve0j2tKBDEEEsIVEAM',
    },
    processing: {
      pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '5', 10),
      processedLabel: process.env.PROCESSED_LABEL || '__auto-processed__',
    },
  };
}
