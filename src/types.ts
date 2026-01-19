export interface Email {
  id: string;
  threadId: string;
  from: string;
  fromAddress: string;
  fromDomain: string;
  to: string[];
  toAddresses: string[];
  toDomains: string[];
  subject: string;
  body: string;
  snippet: string;
  receivedDate: Date;
  labels: string[];
}

export interface LabelRule {
  label: string;
  prompt: string;
}

export interface EmailHistory {
  seenSenderDomains: Set<string>;
  seenSenderAddresses: Set<string>;
  sentDomains: Set<string>;
  sentAddresses: Set<string>;
}

export interface ProcessingResult {
  emailId: string;
  labels: string[];
  success: boolean;
  error?: string;
}
