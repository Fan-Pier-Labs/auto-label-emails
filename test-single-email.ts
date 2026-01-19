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

  // Get email history for deterministic rules
  console.log('\nFetching email history...');
  const history = await getEmailHistory();

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
