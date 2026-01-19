import { parse } from 'csv-parse/sync';
import type { LabelRule } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedRules: LabelRule[] | null = null;
let cacheTimestamp: number = 0;

export async function fetchLabelRules(spreadsheetId: string): Promise<LabelRule[]> {
  const now = Date.now();
  
  // Return cached rules if still valid
  if (cachedRules && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log(`[Sheets] Using cached label rules (${cachedRules.length} rules)`);
    return cachedRules;
  }

  try {
    console.log(`[Sheets] Fetching label rules from Google Sheets...`);
    const startTime = Date.now();
    // Google Sheets CSV export may redirect, so we need to follow redirects
    let csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`;
    
    // Follow redirects manually if needed
    let response = await fetch(csvUrl, { redirect: 'follow' });
    let csvText = await response.text();
    
    // If we get HTML (redirect page), extract the redirect URL and fetch again
    if (csvText.includes('<HTML>') || csvText.includes('Temporary Redirect')) {
      const redirectMatch = csvText.match(/HREF="([^"]+)"/);
      if (redirectMatch) {
        console.log(`[Sheets] Following redirect...`);
        response = await fetch(redirectMatch[1], { redirect: 'follow' });
        csvText = await response.text();
      }
    }
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Google Sheet: ${response.status} ${response.statusText}`);
    }
    console.log(`[Sheets] Fetched CSV (${csvText.length} bytes) in ${Date.now() - startTime}ms`);
    
    if (csvText.length === 0 || csvText.trim().length === 0) {
      throw new Error('Google Sheet appears to be empty');
    }
    
    const parseStartTime = Date.now();
    // Parse CSV - handle both with and without headers
    const records = parse(csvText, {
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
    console.log(`[Sheets] Parsed CSV (${records.length} rows) in ${Date.now() - parseStartTime}ms`);

    const rules: LabelRule[] = [];
    
    // Check if first row looks like headers (has "Label" or "Prompt" or similar)
    const firstRow = records[0] || [];
    const hasHeaders = firstRow.some((cell: string) => 
      cell.toLowerCase().includes('label') || cell.toLowerCase().includes('prompt')
    );
    
    const startIndex = hasHeaders ? 1 : 0; // Skip header row if present

    for (let i = startIndex; i < records.length; i++) {
      const row = records[i];
      if (!row || row.length < 2) continue;
      
      const label = row[0]?.trim();
      const prompt = row[1]?.trim();
      
      if (label && prompt) {
        rules.push({ label, prompt });
      }
    }

    // Update cache
    cachedRules = rules;
    cacheTimestamp = now;
    
    console.log(`[Sheets] Loaded ${rules.length} label rules (${Date.now() - startTime}ms total)`);
    return rules;
  } catch (error) {
    console.error('[Sheets] Error fetching label rules from Google Sheets:', error);
    
    // Return cached rules if available, even if expired
    if (cachedRules) {
      console.warn('[Sheets] Using cached label rules due to fetch error');
      return cachedRules;
    }
    
    throw error;
  }
}
