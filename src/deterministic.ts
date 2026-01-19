import type { Email, EmailHistory } from './types';
import { fetchAllSentEmails, fetchAllReceivedEmails } from './gmail';

let cachedHistory: EmailHistory | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getEmailHistory(useCache: boolean = true): Promise<EmailHistory> {
  const now = Date.now();
  
  if (useCache && cachedHistory && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log('[History] Using cached email history');
    return cachedHistory;
  }

  console.log('[History] Fetching email history from Gmail API...');
  const historyStartTime = Date.now();
  
  const [received, sent] = await Promise.all([
    fetchAllReceivedEmails(),
    fetchAllSentEmails(),
  ]);

  const history: EmailHistory = {
    seenSenderDomains: received.domains,
    seenSenderAddresses: received.addresses,
    sentDomains: sent.domains,
    sentAddresses: sent.addresses,
  };

  cachedHistory = history;
  cacheTimestamp = now;

  console.log(`[History] Email history loaded: ${received.addresses.size} received addresses, ${sent.addresses.size} sent addresses (${Date.now() - historyStartTime}ms total)`);
  
  return history;
}

export async function applyDeterministicLabels(
  email: Email,
  history: EmailHistory
): Promise<string[]> {
  const labels: string[] = [];

  // Rule 1: first-domain - Check if sender domain is new
  if (!history.seenSenderDomains.has(email.fromDomain)) {
    labels.push('first-domain');
  }

  // Rule 2: first-address - Check if sender address is new
  if (!history.seenSenderAddresses.has(email.fromAddress)) {
    labels.push('first-address');
  }

  // Rule 3: no-email-domain - Check if we've never emailed to any of the recipient domains
  const hasNewDomain = email.toDomains.some(domain => !history.sentDomains.has(domain));
  if (hasNewDomain) {
    labels.push('no-email-domain');
  }

  // Rule 4: no-email-address - Check if we've never emailed to any of the recipient addresses
  const hasNewAddress = email.toAddresses.some(addr => !history.sentAddresses.has(addr));
  if (hasNewAddress) {
    labels.push('no-email-address');
  }

  return labels;
}
