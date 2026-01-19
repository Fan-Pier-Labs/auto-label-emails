import OpenAI from 'openai';
import type { Email, LabelRule } from './types';
import type { Config } from './config';

let openaiClient: OpenAI | null = null;
let ollamaConfig: { url: string; model: string } | null = null;

export function initializeAI(config: Config['ai']) {
  if (config.provider === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key is required when using OpenAI provider');
    }
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  } else {
    ollamaConfig = { url: config.ollamaUrl, model: config.ollamaModel };
  }
}

export async function applyAILabels(
  email: Email,
  rules: LabelRule[],
  config: Config['ai']
): Promise<string[]> {
  const labels: string[] = [];
  const emailContent = `${email.subject} ${email.body} ${email.snippet}`.toLowerCase();

  // Simple string matching first (fast and efficient)
  for (const rule of rules) {
    const promptLower = rule.prompt.toLowerCase();
    if (emailContent.includes(promptLower)) {
      labels.push(rule.label);
    }
  }

  // If we found labels with simple matching, return them
  // Otherwise, optionally use AI for more sophisticated matching
  if (labels.length > 0) {
    return labels;
  }

  // Use AI for more nuanced matching if no simple matches found
  // This is optional and can be enhanced later
  if (config.provider === 'openai' && openaiClient) {
    return await matchWithOpenAI(email, rules);
  } else if (config.provider === 'ollama' && ollamaConfig) {
    return await matchWithOllama(email, rules, ollamaConfig);
  }

  return labels;
}

async function matchWithOpenAI(email: Email, rules: LabelRule[]): Promise<string[]> {
  if (!openaiClient) return [];

  const emailContent = `${email.subject}\n\n${email.body || email.snippet}`;
  const rulesText = rules.map(r => `- ${r.label}: ${r.prompt}`).join('\n');

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an email classification assistant. Analyze the email and determine which labels from the list apply. Only return labels that clearly match. Return a comma-separated list of label names, or "none" if no labels apply.`,
        },
        {
          role: 'user',
          content: `Email:\n${emailContent}\n\nAvailable labels:\n${rulesText}\n\nWhich labels apply?`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const result = response.choices[0]?.message?.content?.trim() || '';
    if (result.toLowerCase() === 'none' || !result) {
      return [];
    }

    const matchedLabels = result
      .split(',')
      .map(l => l.trim())
      .filter(l => rules.some(r => r.label === l));

    return matchedLabels;
  } catch (error) {
    console.error('Error matching with OpenAI:', error);
    return [];
  }
}

async function matchWithOllama(
  email: Email,
  rules: LabelRule[],
  config: { url: string; model: string }
): Promise<string[]> {
  const emailContent = `${email.subject}\n\n${email.body || email.snippet}`;
  const rulesText = rules.map(r => `- ${r.label}: ${r.prompt}`).join('\n');

  try {
    const response = await fetch(`${config.url}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        prompt: `You are an email classification assistant. Analyze the email and determine which labels from the list apply. Only return labels that clearly match. Return a comma-separated list of label names, or "none" if no labels apply.

Email:
${emailContent}

Available labels:
${rulesText}

Which labels apply?`,
        options: {
          temperature: 0.3,
          num_predict: 200,
        },
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const result = (data.response || '').trim();
    
    if (result.toLowerCase() === 'none' || !result) {
      return [];
    }

    const matchedLabels = result
      .split(',')
      .map(l => l.trim())
      .filter(l => rules.some(r => r.label === l));

    return matchedLabels;
  } catch (error) {
    console.error('Error matching with Ollama:', error);
    return [];
  }
}
