import { google } from 'googleapis';
import type { Email } from './types';

let authClient: ReturnType<typeof google.auth.OAuth2> | null = null;

export function initializeGmail(
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  authClient = oauth2Client;
  return oauth2Client;
}

function getGmailClient() {
  if (!authClient) {
    throw new Error('Gmail client not initialized. Call initializeGmail first.');
  }
  return google.gmail({ version: 'v1', auth: authClient });
}

export async function createLabelIfNotExists(labelName: string): Promise<string> {
  const gmail = getGmailClient();
  
  try {
    // Try to find existing label
    const { data: { labels } } = await gmail.users.labels.list({ userId: 'me' });
    const existingLabel = labels?.find(l => l.name === labelName);
    
    if (existingLabel?.id) {
      return existingLabel.id;
    }

    // Create new label
    const { data: label } = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelHide', // Hide from label list
        messageListVisibility: 'show', // Show in message list
      },
    });

    if (!label.id) {
      throw new Error(`Failed to create label: ${labelName}`);
    }

    return label.id;
  } catch (error: any) {
    if (error.code === 409) {
      // Label already exists (race condition)
      const { data: { labels } } = await gmail.users.labels.list({ userId: 'me' });
      const existingLabel = labels?.find(l => l.name === labelName);
      return existingLabel?.id || '';
    }
    throw error;
  }
}

export async function fetchUnprocessedRecentEmails(
  processedLabel?: string,
  processedEmailIds?: Set<string>
): Promise<Email[]> {
  const gmail = getGmailClient();
  
  // Build query based on tracking mode
  let query: string;
  if (processedLabel) {
    // Label-based tracking: search for emails that don't have the processed label
    query = `newer_than:1d -label:${processedLabel}`;
  } else {
    // In-memory tracking: fetch all recent emails (filtering happens after)
    query = 'newer_than:1d';
  }
  
  console.log(`[Gmail] Searching for emails with query: ${query}`);
  
  const startTime = Date.now();
  const { data: { messages } } = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 100,
  });
  console.log(`[Gmail] Found ${messages?.length || 0} message(s) in ${Date.now() - startTime}ms`);

  if (!messages || messages.length === 0) {
    return [];
  }

  const emails: Email[] = [];
  // For testing, only fetch the first email
  const limit = process.env.TEST_MODE === 'true' ? 1 : messages.length;
  console.log(`[Gmail] Fetching details for ${limit} email(s) (${messages.length} total available)...`);

  for (let i = 0; i < Math.min(limit, messages.length); i++) {
    const message = messages[i];
    if (!message.id) continue;

    // Skip if using in-memory tracking and email ID is already processed
    if (processedEmailIds && processedEmailIds.has(message.id)) {
      continue;
    }

    try {
      const msgStartTime = Date.now();
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full',
      });
      console.log(`[Gmail] Fetched email ${i + 1}/${messages.length} (${message.id}) in ${Date.now() - msgStartTime}ms`);

      const email = parseEmail(msg);
      if (email) {
        emails.push(email);
      }
    } catch (error) {
      console.error(`[Gmail] Error fetching email ${message.id}:`, error);
    }
  }

  console.log(`[Gmail] Successfully parsed ${emails.length} email(s)`);
  return emails;
}

function parseEmail(msg: any): Email | null {
  if (!msg.id || !msg.payload) {
    return null;
  }

  const headers = msg.payload.headers || [];
  const getHeader = (name: string) => 
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const from = getHeader('From');
  const fromMatch = from.match(/<(.+)>/);
  const fromAddress = fromMatch ? fromMatch[1] : from;
  const fromDomain = fromAddress.split('@')[1] || '';

  const to = getHeader('To') || '';
  const toAddresses = extractEmailAddresses(to);
  const toDomains = toAddresses.map(addr => addr.split('@')[1] || '').filter(Boolean);

  const subject = getHeader('Subject');
  const snippet = msg.snippet || '';
  const body = extractBody(msg.payload);
  const receivedDate = new Date(parseInt(msg.internalDate || '0', 10));
  const labels = msg.labelIds || [];

  return {
    id: msg.id,
    threadId: msg.threadId || '',
    from,
    fromAddress,
    fromDomain,
    to: toAddresses,
    toAddresses,
    toDomains,
    subject,
    body,
    snippet,
    receivedDate,
    labels,
  };
}

export function extractEmailAddresses(text: string): string[] {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches)];
}

function extractBody(payload: any): string {
  let body = '';

  if (payload.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  } else if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
        // Fallback to HTML if no plain text
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        // Simple HTML tag removal
        body = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      } else if (part.parts) {
        // Recursive for multipart
        body += extractBody(part);
      }
    }
  }

  return body;
}

export async function fetchAllSentEmails(): Promise<{ addresses: Set<string>; domains: Set<string> }> {
  const gmail = getGmailClient();
  const addresses = new Set<string>();
  const domains = new Set<string>();

  console.log('[Gmail] Fetching sent emails history...');
  const startTime = Date.now();
  let pageToken: string | undefined;
  let hasMore = true;
  let totalMessages = 0;
  let pageCount = 0;

  while (hasMore) {
    pageCount++;
    const pageStartTime = Date.now();
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent',
      maxResults: 500,
      pageToken,
    });

    if (!data.messages || data.messages.length === 0) {
      hasMore = false;
      break;
    }

    totalMessages += data.messages.length;
    console.log(`[Gmail] Sent emails page ${pageCount}: ${data.messages.length} messages (${Date.now() - pageStartTime}ms)`);

    // Fetch message details in batches (limit to first 1000 for speed)
    const limit = Math.min(data.messages.length, 1000 - addresses.size);
    for (let i = 0; i < limit; i++) {
      const message = data.messages[i];
      if (!message.id) continue;

      try {
        const { data: msg } = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['To', 'Cc', 'Bcc'],
        });

        const headers = msg.payload?.headers || [];
        const to = headers.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
        const cc = headers.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';
        const bcc = headers.find((h: any) => h.name.toLowerCase() === 'bcc')?.value || '';

        const allRecipients = extractEmailAddresses(`${to} ${cc} ${bcc}`);
        for (const addr of allRecipients) {
          addresses.add(addr);
          const domain = addr.split('@')[1];
          if (domain) {
            domains.add(domain);
          }
        }
      } catch (error) {
        console.error(`[Gmail] Error fetching sent email ${message.id}:`, error);
      }
    }

    if (addresses.size >= 1000) {
      console.log(`[Gmail] Reached limit of 1000 sent addresses, stopping`);
      break;
    }

    pageToken = data.nextPageToken || undefined;
    hasMore = !!pageToken;
  }

  console.log(`[Gmail] Sent emails history: ${addresses.size} addresses, ${domains.size} domains (${Date.now() - startTime}ms total)`);
  return { addresses, domains };
}

export async function fetchAllReceivedEmails(): Promise<{ addresses: Set<string>; domains: Set<string> }> {
  const gmail = getGmailClient();
  const addresses = new Set<string>();
  const domains = new Set<string>();

  console.log('[Gmail] Fetching received emails history...');
  const startTime = Date.now();
  let pageToken: string | undefined;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    pageCount++;
    const pageStartTime = Date.now();
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox OR in:all',
      maxResults: 500,
      pageToken,
    });

    if (!data.messages || data.messages.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`[Gmail] Received emails page ${pageCount}: ${data.messages.length} messages (${Date.now() - pageStartTime}ms)`);

    // Fetch message details in batches (limit to first 1000 for speed)
    const limit = Math.min(data.messages.length, 1000 - addresses.size);
    for (let i = 0; i < limit; i++) {
      const message = data.messages[i];
      if (!message.id) continue;

      try {
        const { data: msg } = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['From'],
        });

        const headers = msg.payload?.headers || [];
        const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
        const fromAddresses = extractEmailAddresses(from);

        for (const addr of fromAddresses) {
          addresses.add(addr);
          const domain = addr.split('@')[1];
          if (domain) {
            domains.add(domain);
          }
        }
      } catch (error) {
        console.error(`[Gmail] Error fetching received email ${message.id}:`, error);
      }
    }

    if (addresses.size >= 1000) {
      console.log(`[Gmail] Reached limit of 1000 received addresses, stopping`);
      break;
    }

    pageToken = data.nextPageToken || undefined;
    hasMore = !!pageToken;
  }

  console.log(`[Gmail] Received emails history: ${addresses.size} addresses, ${domains.size} domains (${Date.now() - startTime}ms total)`);
  return { addresses, domains };
}

export async function getLabelId(labelName: string): Promise<string | null> {
  const gmail = getGmailClient();
  const { data: { labels } } = await gmail.users.labels.list({ userId: 'me' });
  const label = labels?.find(l => l.name === labelName);
  return label?.id || null;
}

export async function applyLabels(emailId: string, labelNames: string[]): Promise<void> {
  const gmail = getGmailClient();
  
  const labelIds: string[] = [];
  
  for (const labelName of labelNames) {
    const labelId = await getLabelId(labelName);
    if (labelId) {
      labelIds.push(labelId);
    } else {
      // Create label if it doesn't exist
      const newLabelId = await createLabelIfNotExists(labelName);
      labelIds.push(newLabelId);
    }
  }

  if (labelIds.length === 0) {
    return;
  }

  await gmail.users.messages.modify({
    userId: 'me',
    id: emailId,
    requestBody: {
      addLabelIds: labelIds,
    },
  });
}

export async function markAsProcessed(emailId: string, processedLabel: string): Promise<void> {
  await applyLabels(emailId, [processedLabel]);
}

// Check if we've received emails from a specific address (excluding current email)
export async function hasReceivedFromAddress(emailAddress: string, excludeEmailId?: string): Promise<boolean> {
  const gmail = getGmailClient();
  try {
    // Gmail search: wrap email in quotes to handle special characters
    const query = `from:"${emailAddress}"`;
    
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 2, // Get up to 2 to check if there are others besides current
    });
    
    if (!data.messages || data.messages.length === 0) {
      return false;
    }
    
    // If we have excludeEmailId, check if any result is NOT the current email
    if (excludeEmailId) {
      return data.messages.some(msg => msg.id !== excludeEmailId);
    }
    
    return true;
  } catch (error) {
    console.error(`[Gmail] Error checking received from address ${emailAddress}:`, error);
    return false;
  }
}

// Check if we've received emails from a specific domain (excluding current email)
export async function hasReceivedFromDomain(domain: string, excludeEmailId?: string): Promise<boolean> {
  const gmail = getGmailClient();
  try {
    // Gmail search: from:domain.com searches for emails from that domain
    const query = `from:${domain}`;
    
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 2, // Get up to 2 to check if there are others besides current
    });
    
    if (!data.messages || data.messages.length === 0) {
      return false;
    }
    
    // If we have excludeEmailId, check if any result is NOT the current email
    if (excludeEmailId) {
      return data.messages.some(msg => msg.id !== excludeEmailId);
    }
    
    return true;
  } catch (error) {
    console.error(`[Gmail] Error checking received from domain ${domain}:`, error);
    return false;
  }
}

// Check if we've sent emails to a specific address
export async function hasSentToAddress(emailAddress: string): Promise<boolean> {
  const gmail = getGmailClient();
  try {
    // Gmail search: wrap email in quotes to handle special characters
    const query = `to:"${emailAddress}" in:sent`;
    
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 1,
    });
    
    return (data.messages?.length || 0) > 0;
  } catch (error) {
    console.error(`[Gmail] Error checking sent to address ${emailAddress}:`, error);
    return false;
  }
}

// Check if we've sent emails to a specific domain
export async function hasSentToDomain(domain: string): Promise<boolean> {
  const gmail = getGmailClient();
  try {
    const query = `to:${domain} in:sent`;
    
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 1,
    });
    
    return (data.messages?.length || 0) > 0;
  } catch (error) {
    console.error(`[Gmail] Error checking sent to domain ${domain}:`, error);
    return false;
  }
}
