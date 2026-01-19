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

export async function fetchUnprocessedRecentEmails(processedLabel: string): Promise<Email[]> {
  const gmail = getGmailClient();
  
  // Search for emails from last 24 hours that don't have the processed label
  const query = `newer_than:1d -label:${processedLabel}`;
  
  const { data: { messages } } = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 100,
  });

  if (!messages || messages.length === 0) {
    return [];
  }

  const emails: Email[] = [];

  for (const message of messages) {
    if (!message.id) continue;

    try {
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full',
      });

      const email = parseEmail(msg);
      if (email) {
        emails.push(email);
      }
    } catch (error) {
      console.error(`Error fetching email ${message.id}:`, error);
    }
  }

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

function extractEmailAddresses(text: string): string[] {
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

  let pageToken: string | undefined;
  let hasMore = true;

  while (hasMore) {
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

    // Fetch message details in batches
    for (const message of data.messages) {
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
        console.error(`Error fetching sent email ${message.id}:`, error);
      }
    }

    pageToken = data.nextPageToken || undefined;
    hasMore = !!pageToken;
  }

  return { addresses, domains };
}

export async function fetchAllReceivedEmails(): Promise<{ addresses: Set<string>; domains: Set<string> }> {
  const gmail = getGmailClient();
  const addresses = new Set<string>();
  const domains = new Set<string>();

  let pageToken: string | undefined;
  let hasMore = true;

  while (hasMore) {
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

    // Fetch message details in batches
    for (const message of data.messages) {
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
        console.error(`Error fetching received email ${message.id}:`, error);
      }
    }

    pageToken = data.nextPageToken || undefined;
    hasMore = !!pageToken;
  }

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
