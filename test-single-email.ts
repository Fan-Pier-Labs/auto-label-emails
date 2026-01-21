import { loadConfig } from './src/config';
import { initializeGmail, createLabelIfNotExists, fetchUnprocessedRecentEmails, applyLabels, markAsProcessed } from './src/gmail';
import { applyDeterministicLabels } from './src/deterministic';
import { fetchLabelRules } from './src/sheets';
import { initializeAI, applyAILabels } from './src/ai-labeler';
import type { Email, ProcessingResult } from './src/types';

async function testSingleEmail() {
  console.log('=== Testing Single Email Processing ===\n');

  // Load configuration
  const config = loadConfig();
  console.log(`AI Provider: ${config.ai.provider}`);
  console.log(`Tracking Mode: ${config.processing.useInMemoryTracking ? 'In-Memory' : 'Gmail Label'}`);
  if (!config.processing.useInMemoryTracking) {
    console.log(`Processed Label: ${config.processing.processedLabel}`);
  }
  console.log();

  // Initialize Gmail client
  initializeGmail(
    config.gmail.clientId,
    config.gmail.clientSecret,
    config.gmail.refreshToken
  );

  // Ensure processed label exists (only if not using in-memory tracking)
  if (!config.processing.useInMemoryTracking) {
    console.log('Ensuring processed label exists...');
    await createLabelIfNotExists(config.processing.processedLabel);
    console.log('✓ Processed label ready\n');
  }

  // Initialize AI (waits for Ollama to start if using Ollama)
  console.log('Initializing AI...');
  await initializeAI(config.ai);
  console.log('✓ AI client initialized\n');

  // In-memory tracking for test script
  const processedEmailIds = new Set<string>();

  // Fetch unprocessed emails (up to 50)
  console.log('Fetching unprocessed emails...');
  const allEmails = await fetchUnprocessedRecentEmails(
    config.processing.useInMemoryTracking ? undefined : config.processing.processedLabel,
    config.processing.useInMemoryTracking ? processedEmailIds : undefined
  );
  
  if (allEmails.length === 0) {
    console.log('No unprocessed emails found in the last 24 hours.');
    process.exit(0);
  }

  // Process up to 50 emails
  const emailsToProcess = allEmails.slice(0, 50);
  console.log(`\nProcessing ${emailsToProcess.length} email(s) (${allEmails.length} total available)\n`);

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
      // Apply deterministic labels (uses Gmail search API)
      const deterministicLabels = await applyDeterministicLabels(email);
      console.log(`  Deterministic: ${deterministicLabels.join(', ') || 'none'}`);

      // Apply AI labels
      const aiLabels = await applyAILabels(email, rules, config.ai);
      console.log(`  AI: ${aiLabels.join(', ') || 'none'}`);

      // Combine all labels
      const allLabels = [...new Set([...deterministicLabels, ...aiLabels])];
      
      // Apply labels
      if (allLabels.length > 0) {
        const labelsToApply = config.processing.useInMemoryTracking 
          ? allLabels 
          : [...allLabels, config.processing.processedLabel];
        await applyLabels(email.id, labelsToApply);
        console.log(`  ✓ Applied: ${allLabels.join(', ')}`);
      } else {
        // Even if no labels, mark as processed (only if not using in-memory tracking)
        if (!config.processing.useInMemoryTracking) {
          await markAsProcessed(email.id, config.processing.processedLabel);
        }
        console.log(`  ✓ No labels${config.processing.useInMemoryTracking ? '' : ' (marked as processed)'}`);
      }

      // Add to in-memory tracking if enabled
      if (config.processing.useInMemoryTracking) {
        processedEmailIds.add(email.id);
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
