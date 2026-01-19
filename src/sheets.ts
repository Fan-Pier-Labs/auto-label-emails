import { parse } from 'csv-parse/sync';
import type { LabelRule } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedRules: LabelRule[] | null = null;
let cacheTimestamp: number = 0;

export async function fetchLabelRules(spreadsheetId: string): Promise<LabelRule[]> {
  const now = Date.now();
  
  // Return cached rules if still valid
  if (cachedRules && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRules;
  }

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`;
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Google Sheet: ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, string>>;

    const rules: LabelRule[] = [];
    
    // Get column names (first row)
    const columns = Object.keys(records[0] || {});
    const labelColumn = columns[0] || 'Label';
    const promptColumn = columns[1] || 'Prompt';

    for (const record of records) {
      const label = record[labelColumn]?.trim();
      const prompt = record[promptColumn]?.trim();
      
      if (label && prompt) {
        rules.push({ label, prompt });
      }
    }

    // Update cache
    cachedRules = rules;
    cacheTimestamp = now;
    
    return rules;
  } catch (error) {
    console.error('Error fetching label rules from Google Sheets:', error);
    
    // Return cached rules if available, even if expired
    if (cachedRules) {
      console.warn('Using cached label rules due to fetch error');
      return cachedRules;
    }
    
    throw error;
  }
}
