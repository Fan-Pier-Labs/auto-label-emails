import type { Email } from './types';
import { 
  hasReceivedFromDomain, 
  hasReceivedFromAddress, 
  hasSentToDomain, 
  hasSentToAddress 
} from './gmail';

export async function applyDeterministicLabels(email: Email): Promise<string[]> {
  const labels: string[] = [];

  // Rule 1: first-domain - Check if sender domain is new (excluding current email)
  const hasReceivedFromDomainResult = await hasReceivedFromDomain(email.fromDomain, email.id);
  if (!hasReceivedFromDomainResult) {
    labels.push('first-domain');
  }

  // Rule 2: first-address - Check if sender address is new (excluding current email)
  const hasReceivedFromAddressResult = await hasReceivedFromAddress(email.fromAddress, email.id);
  if (!hasReceivedFromAddressResult) {
    labels.push('first-address');
  }

  // Rule 3: no-email-domain - Check if we've never emailed to any of the recipient domains
  const domainChecks = await Promise.all(
    email.toDomains.map(domain => hasSentToDomain(domain))
  );
  const hasNewDomain = domainChecks.some(hasSent => !hasSent);
  if (hasNewDomain) {
    labels.push('no-email-domain');
  }

  // Rule 4: no-email-address - Check if we've never emailed to any of the recipient addresses
  const addressChecks = await Promise.all(
    email.toAddresses.map(addr => hasSentToAddress(addr))
  );
  const hasNewAddress = addressChecks.some(hasSent => !hasSent);
  if (hasNewAddress) {
    labels.push('no-email-address');
  }

  return labels;
}
