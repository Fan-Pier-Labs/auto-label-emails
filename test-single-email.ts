import { loadConfig } from './src/config';
import { initializeGmail, createLabelIfNotExists, fetchUnprocessedRecentEmails, applyLabels, markAsProcessed } from './src/gmail';
import { getEmailHistory, applyDeterministicLabels } from './src/deterministic';
import { fetchLabelRules } from './src/sheets';
import { initializeAI, applyAILabels } from './src/ai-labeler';
import type { Email } from './src/types';

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

  // Fetch the most recent unprocessed email
  console.log('Fetching most recent unprocessed email...');
  const emails = await fetchUnprocessedRecentEmails(config.processing.processedLabel);
  
  if (emails.length === 0) {
    console.log('No unprocessed emails found in the last 24 hours.');
    process.exit(0);
  }

  // Get the first (most recent) email
  const email = emails[0];
  console.log(`✓ Found email: ${email.id}`);
  console.log(`  From: ${email.from}`);
  console.log(`  Subject: ${email.subject}`);
  console.log(`  Received: ${email.receivedDate.toISOString()}\n`);

  // Get email history for deterministic rules
  console.log('Fetching email history...');
  const history = await getEmailHistory();
  console.log(`✓ History loaded: ${history.seenSenderAddresses.size} received, ${history.sentAddresses.size} sent\n`);

  // Apply deterministic labels
  console.log('Applying deterministic labels...');
  const deterministicLabels = await applyDeterministicLabels(email, history);
  console.log(`✓ Deterministic labels: ${deterministicLabels.join(', ') || 'none'}\n`);

  // Fetch label rules from Google Sheets
  console.log('Fetching label rules from Google Sheets...');
  const rules = await fetchLabelRules(config.sheets.spreadsheetId);
  console.log(`✓ Loaded ${rules.length} label rules\n`);

  // Apply AI labels
  console.log('Applying AI labels...');
  const aiLabels = await applyAILabels(email, rules, config.ai);
  console.log(`✓ AI labels: ${aiLabels.join(', ') || 'none'}\n`);

  // Combine all labels
  const allLabels = [...new Set([...deterministicLabels, ...aiLabels])];
  
  console.log('=== Results ===');
  console.log(`Total labels to apply: ${allLabels.length}`);
  if (allLabels.length > 0) {
    console.log(`Labels: ${allLabels.join(', ')}`);
  }

  // Ask for confirmation before applying
  console.log('\nWould you like to apply these labels? (This will mark the email as processed)');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to apply...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Apply labels
  if (allLabels.length > 0) {
    console.log('Applying labels...');
    await applyLabels(email.id, [...allLabels, config.processing.processedLabel]);
    console.log(`✓ Applied labels: ${allLabels.join(', ')}`);
  } else {
    console.log('No labels to apply, marking as processed...');
    await markAsProcessed(email.id, config.processing.processedLabel);
  }
  
  console.log('✓ Email marked as processed');
  console.log('\n=== Test Complete ===');
}

testSingleEmail().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
