import { loadConfig } from './config';
import { initializeGmail, createLabelIfNotExists, fetchUnprocessedRecentEmails, applyLabels, markAsProcessed } from './gmail';
import { applyDeterministicLabels } from './deterministic';
import { fetchLabelRules } from './sheets';
import { initializeAI, applyAILabels } from './ai-labeler';
import type { Email, ProcessingResult } from './types';

let isRunning = false;
let shouldStop = false;
// In-memory tracking of processed email IDs
const processedEmailIds = new Set<string>();

async function processEmail(
  email: Email,
  config: ReturnType<typeof loadConfig>
): Promise<ProcessingResult> {
  try {
    console.log(`Processing email ${email.id}: ${email.subject}`);

    // Apply deterministic labels (uses Gmail search API)
    const deterministicLabels = await applyDeterministicLabels(email);
    console.log(`  Deterministic labels: ${deterministicLabels.join(', ') || 'none'}`);

    // Fetch label rules from Google Sheets
    const rules = await fetchLabelRules(config.sheets.spreadsheetId);

    // Apply AI labels
    const aiLabels = await applyAILabels(email, rules, config.ai);
    console.log(`  AI labels: ${aiLabels.join(', ') || 'none'}`);

    // Combine all labels
    const allLabels = [...new Set([...deterministicLabels, ...aiLabels])];

    if (allLabels.length > 0) {
      // Apply all labels (and processed label if not using in-memory tracking)
      const labelsToApply = config.processing.useInMemoryTracking 
        ? allLabels 
        : [...allLabels, config.processing.processedLabel];
      await applyLabels(email.id, labelsToApply);
      console.log(`  Applied labels: ${allLabels.join(', ')}`);
    } else {
      // Even if no labels, mark as processed (only if not using in-memory tracking)
      if (!config.processing.useInMemoryTracking) {
        await markAsProcessed(email.id, config.processing.processedLabel);
      }
      console.log(`  No labels to apply`);
    }

    // Add to in-memory tracking if enabled
    if (config.processing.useInMemoryTracking) {
      processedEmailIds.add(email.id);
    }

    return {
      emailId: email.id,
      labels: allLabels,
      success: true,
    };
  } catch (error: any) {
    console.error(`Error processing email ${email.id}:`, error);
    return {
      emailId: email.id,
      labels: [],
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

async function runProcessingCycle(config: ReturnType<typeof loadConfig>) {
  if (isRunning) {
    console.log('Processing cycle already running, skipping...');
    return;
  }

  isRunning = true;

  try {
    console.log('\n=== Starting email processing cycle ===');
    console.log(`Time: ${new Date().toISOString()}`);

    // Fetch unprocessed emails
    const emails = await fetchUnprocessedRecentEmails(
      config.processing.useInMemoryTracking ? undefined : config.processing.processedLabel,
      config.processing.useInMemoryTracking ? processedEmailIds : undefined
    );
    console.log(`Found ${emails.length} unprocessed email(s)`);

    if (emails.length === 0) {
      console.log('No emails to process');
      return;
    }

    // Process each email
    const results: ProcessingResult[] = [];
    for (const email of emails) {
      if (shouldStop) {
        console.log('Stop requested, aborting processing...');
        break;
      }

      const result = await processEmail(email, config);
      results.push(result);
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`\nProcessing complete: ${successful} succeeded, ${failed} failed`);
  } catch (error) {
    console.error('Error in processing cycle:', error);
  } finally {
    isRunning = false;
  }
}

async function main() {
  console.log('Starting Email Auto-Labeling Service...');

  // Load configuration
  const config = loadConfig();
  console.log(`AI Provider: ${config.ai.provider}`);
  console.log(`Poll Interval: ${config.processing.pollIntervalMinutes} minutes`);
  console.log(`Tracking Mode: ${config.processing.useInMemoryTracking ? 'In-Memory' : 'Gmail Label'}`);
  if (!config.processing.useInMemoryTracking) {
    console.log(`Processed Label: ${config.processing.processedLabel}`);
  }

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
    console.log('Processed label ready');
  }

  // Initialize AI (waits for Ollama to start if using Ollama)
  console.log('Initializing AI...');
  await initializeAI(config.ai);
  console.log('AI client initialized');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    shouldStop = true;
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    shouldStop = true;
  });

  // Run initial cycle
  await runProcessingCycle(config);

  // Schedule periodic runs
  const intervalMs = config.processing.pollIntervalMinutes * 60 * 1000;
  const intervalId = setInterval(async () => {
    if (shouldStop) {
      clearInterval(intervalId);
      console.log('Stopped scheduling new cycles');
      return;
    }
    await runProcessingCycle(config);
  }, intervalMs);

  console.log(`Scheduled to run every ${config.processing.pollIntervalMinutes} minutes`);
  console.log('Service running. Press Ctrl+C to stop.\n');

  // Keep process alive
  await new Promise<void>((resolve) => {
    const checkStop = setInterval(() => {
      if (shouldStop && !isRunning) {
        clearInterval(checkStop);
        clearInterval(intervalId);
        console.log('Service stopped');
        resolve();
      }
    }, 1000);
  });
}

// Run the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
