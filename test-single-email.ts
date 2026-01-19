import { loadConfig } from './src/config';
import { initializeGmail, createLabelIfNotExists, fetchUnprocessedRecentEmails, applyLabels, markAsProcessed } from './src/gmail';
import { getEmailHistory, applyDeterministicLabels } from './src/deterministic';
import { fetchLabelRules } from './src/sheets';
import { initializeAI, applyAILabels } from './src/ai-labeler';
import type { Email, ProcessingResult } from './src/types';

async function testSingleEmail() {
  console.log('=== Testing Single Email Processing ===\n');

  // Load configuration
  const config = loadConfig();
  console.log(`AI Provider: ${config.ai.provider}`);
  console.log(`Processed Label: ${config.processing.processedLabel}\n`);

  // Initialize Gmail client
  initializeGmail(
    config.gmail.clientId,
    config.gmail.clientSecret,
    config.gmail.refreshToken
  );

  // Ensure processed label exists
  console.log('Ensuring processed label exists...');
  await createLabelIfNotExists(config.processing.processedLabel);
  console.log('✓ Processed label ready\n');

  // Initialize AI
  initializeAI(config.ai);
  console.log('✓ AI client initialized\n');

  // Fetch unprocessed emails (up to 50)
  console.log('Fetching unprocessed emails...');
  const allEmails = await fetchUnprocessedRecentEmails(config.processing.processedLabel);
  
  if (allEmails.length === 0) {
    console.log('No unprocessed emails found in the last 24 hours.');
    process.exit(0);
  }

  // Process up to 50 emails
  const emailsToProcess = allEmails.slice(0, 50);
  console.log(`\nProcessing ${emailsToProcess.length} email(s) (${allEmails.length} total available)\n`);
  console.log(`✓ Found email: ${email.id}`);
  console.log(`  From: ${email.from}`);
  console.log(`  Subject: ${email.subject}`);
  console.log(`  Received: ${email.receivedDate.toISOString()}\n`);

  // Get email history for deterministic rules
  // For testing, we'll use a limited sample to speed things up
  console.log('\nFetching email history (limited sample for testing)...');
  const historyStartTime = Date.now();
  
  // Use a smaller sample for testing - just check recent emails
  const gmail = google.gmail({ version: 'v1', auth: initializeGmail(
    config.gmail.clientId,
    config.gmail.clientSecret,
    config.gmail.refreshToken
  ) });
  const receivedAddresses = new Set<string>();
  const receivedDomains = new Set<string>();
  const sentAddresses = new Set<string>();
  const sentDomains = new Set<string>();
  
  // Quick check: just get the first 100 received and sent emails
  console.log('[History] Fetching sample of recent emails...');
  
  const [receivedData, sentData] = await Promise.all([
    gmail.users.messages.list({ userId: 'me', q: 'in:inbox', maxResults: 100 }),
    gmail.users.messages.list({ userId: 'me', q: 'in:sent', maxResults: 100 }),
  ]);
  
  console.log(`[History] Found ${receivedData.data.messages?.length || 0} received, ${sentData.data.messages?.length || 0} sent`);
  
  // Process a small sample (first 20 of each)
  const receivedSample = (receivedData.data.messages || []).slice(0, 20);
  const sentSample = (sentData.data.messages || []).slice(0, 20);
  
  for (const msg of receivedSample) {
    if (!msg.id) continue;
    try {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From'],
      });
      const from = data.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
      const addrs = extractEmailAddresses(from);
      for (const addr of addrs) {
        receivedAddresses.add(addr);
        const domain = addr.split('@')[1];
        if (domain) receivedDomains.add(domain);
      }
    } catch (e) {}
  }
  
  for (const msg of sentSample) {
    if (!msg.id) continue;
    try {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['To', 'Cc'],
      });
      const to = data.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'to')?.value || '';
      const cc = data.payload?.headers?.find((h: any) => h.name.toLowerCase() === 'cc')?.value || '';
      const addrs = extractEmailAddresses(`${to} ${cc}`);
      for (const addr of addrs) {
        sentAddresses.add(addr);
        const domain = addr.split('@')[1];
        if (domain) sentDomains.add(domain);
      }
    } catch (e) {}
  }
  
  const history = {
    seenSenderDomains: receivedDomains,
    seenSenderAddresses: receivedAddresses,
    sentDomains: sentDomains,
    sentAddresses: sentAddresses,
  };
  
  console.log(`✓ History loaded: ${receivedAddresses.size} received, ${sentAddresses.size} sent (${Date.now() - historyStartTime}ms)\n`);

  // Fetch label rules from Google Sheets (once for all emails)
  console.log('Fetching label rules from Google Sheets...');
  const rules = await fetchLabelRules(config.sheets.spreadsheetId);
  console.log(`✓ Loaded ${rules.length} label rules\n`);

  // Process each email
  const results: ProcessingResult[] = [];
  for (let i = 0; i < emailsToProcess.length; i++) {
    const email = emailsToProcess[i];
    console.log(`\n[${i + 1}/${emailsToProcess.length}] Processing: ${email.subject}`);
    console.log(`  From: ${email.from}`);
    
    try {
      // Apply deterministic labels
      const deterministicLabels = await applyDeterministicLabels(email, history);
      console.log(`  Deterministic: ${deterministicLabels.join(', ') || 'none'}`);

      // Apply AI labels
      const aiLabels = await applyAILabels(email, rules, config.ai);
      console.log(`  AI: ${aiLabels.join(', ') || 'none'}`);

      // Combine all labels
      const allLabels = [...new Set([...deterministicLabels, ...aiLabels])];
      
      // Apply labels
      if (allLabels.length > 0) {
        await applyLabels(email.id, [...allLabels, config.processing.processedLabel]);
        console.log(`  ✓ Applied: ${allLabels.join(', ')}`);
      } else {
        await markAsProcessed(email.id, config.processing.processedLabel);
        console.log(`  ✓ No labels (marked as processed)`);
      }
      
      results.push({
        emailId: email.id,
        labels: allLabels,
        success: true,
      });
    } catch (error: any) {
      console.error(`  ✗ Error: ${error.message}`);
      results.push({
        emailId: email.id,
        labels: [],
        success: false,
        error: error.message,
      });
    }
  }
  
  // Summary
  console.log('\n=== Processing Complete ===');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalLabels = results.reduce((sum, r) => sum + r.labels.length, 0);
  console.log(`Processed: ${successful} succeeded, ${failed} failed`);
  console.log(`Total labels applied: ${totalLabels}`);
}

testSingleEmail().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
