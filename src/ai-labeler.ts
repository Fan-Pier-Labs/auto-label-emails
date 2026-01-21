import OpenAI from 'openai';
import type { Email, LabelRule } from './types';
import type { Config } from './config';

let openaiClient: OpenAI | null = null;
let ollamaConfig: { url: string; model: string } | null = null;

export async function waitForOllama(url: string, model: string, maxRetries: number = 30, retryDelayMs: number = 2000): Promise<void> {
  console.log(`[AI] Waiting for Ollama to start at ${url}...`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        console.log(`[AI] Ollama is ready!`);
        
        // Verify model is available
        const modelsData = (await response.json().catch(() => ({ models: [] }))) as { models?: Array<{ name: string }> };
        const availableModels = modelsData.models || [];
        const modelNames = availableModels.map((m: any) => m.name);
        console.log(`[AI] Available models: ${modelNames.join(', ') || 'none'}`);
        
        // Check if the required model exists
        const modelExists = modelNames.some((name: string) => 
          name === model || 
          name.startsWith(model.split(':')[0] + ':') ||
          name === model.split(':')[0]
        );
        
        if (!modelExists) {
          throw new Error(`Model ${model} not found. Run: ollama pull ${model}`);
        }
        
        console.log(`[AI] Model ${model} is available`);
        return;
      }
    } catch (error: any) {
      // If it's a model error, throw immediately
      if (error.message && error.message.includes('Model') && error.message.includes('not found')) {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        console.log(`[AI] Ollama not ready yet, waiting... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      } else {
        throw new Error(`Ollama failed to start after ${maxRetries} attempts. Make sure Ollama is running: ollama serve`);
      }
    }
  }
  
  throw new Error(`Ollama failed to start after ${maxRetries} attempts. Make sure Ollama is running: ollama serve`);
}

export async function initializeAI(config: Config['ai']) {
  if (config.provider === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key is required when using OpenAI provider');
    }
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  } else {
    // Wait for Ollama to be ready and verify model before proceeding
    await waitForOllama(config.ollamaUrl, config.ollamaModel);
    ollamaConfig = { url: config.ollamaUrl, model: config.ollamaModel };
  }
}

function hasUnsubscribeLink(email: Email): boolean {
  // Check for common unsubscribe patterns in email body and snippet
  const content = `${email.body} ${email.snippet}`.toLowerCase();
  
  // Common unsubscribe patterns
  const unsubscribePatterns = [
    /unsubscribe/i,
    /opt[-\s]?out/i,
    /opt[-\s]?out/i,
    /remove\s+me/i,
    /unsub/i,
    /email\s+preferences/i,
    /manage\s+subscription/i,
    /subscription\s+preferences/i,
    /preference\s+center/i,
  ];
  
  // Check for unsubscribe links (URLs containing unsubscribe-related terms)
  const urlPattern = /https?:\/\/[^\s]+(unsubscribe|opt[-\s]?out|remove|preference|subscription)[^\s]*/i;
  
  // Check if any pattern matches
  const hasPattern = unsubscribePatterns.some(pattern => pattern.test(content));
  const hasUrl = urlPattern.test(content);
  
  return hasPattern || hasUrl;
}

function buildClassificationPrompt(email: Email, rule: LabelRule): string {
  const emailContent = `${email.subject}\n\n${email.body || email.snippet}`;
  
  return `You are a strict email classification assistant. You must be VERY conservative and only match emails that CLEARLY and EXACTLY match the rule description.

IMPORTANT RULES:
- If the email is similar but not exactly matching, return match: "no"
- If the email matches a different but related concept, return match: "no"
- If you have any doubt, return match: "no"
- Only return match: "yes" if the email is an unambiguous, clear match to the rule
- Pay close attention to specific details (like location names, exact criteria)
- Do NOT match based on partial similarity or loose associations
- You MUST respond with valid JSON only, no other text

Email:
${emailContent}

Rule:
Label: ${rule.label}
Description: ${rule.prompt}

Does this email CLEARLY and EXACTLY match the rule description? Be very strict. Respond with JSON in this exact format:
{
  "match": "yes" or "no",
  "reason": "brief explanation"
}`;
}

export async function applyAILabels(
  email: Email,
  rules: LabelRule[],
  config: Config['ai']
): Promise<string[]> {
  const labels: string[] = [];
  const emailContent = `${email.subject} ${email.body} ${email.snippet}`.toLowerCase();

  // Print email title
  console.log(`  Email with title: ${email.subject}`);

  // Static rule: Check for unsubscribe links
  if (hasUnsubscribeLink(email)) {
    labels.push('Has-Unsubscribe');
    console.log(`  ✓ Matched static rule: Has-Unsubscribe (email contains unsubscribe link)`);
  }

  // Process each rule separately with its own LLM call
  const matchedRules: LabelRule[] = [];
  const nonMatchedRules: LabelRule[] = [];

  for (const rule of rules) {
    // First try simple string matching (fast and efficient)
    const promptLower = rule.prompt.toLowerCase();
    const simpleMatch = emailContent.includes(promptLower);
    
    if (simpleMatch) {
      labels.push(rule.label);
      matchedRules.push(rule);
      console.log(`  ✓ Matched rule: ${rule.label} - ${rule.prompt}`);
      continue;
    }

    // If no simple match, use AI to check this specific rule
    let aiMatch = false;
    let aiReasoning = '';
    let rawAnswer = '';
    if (config.provider === 'openai' && openaiClient) {
      const result = await matchSingleRuleWithOpenAI(email, rule);
      aiMatch = result.match;
      aiReasoning = result.reasoning;
      rawAnswer = result.rawAnswer;
    } else if (config.provider === 'ollama' && ollamaConfig) {
      const result = await matchSingleRuleWithOllama(email, rule, ollamaConfig);
      aiMatch = result.match;
      aiReasoning = result.reasoning;
      rawAnswer = result.rawAnswer;
    }

    if (aiMatch) {
      labels.push(rule.label);
      matchedRules.push(rule);
      console.log(`  ✓ Matched rule: ${rule.label} - ${rule.prompt} [LLM: ${rawAnswer}]${aiReasoning ? ` (${aiReasoning})` : ''}`);
    } else {
      nonMatchedRules.push(rule);
      console.log(`  ✗ Did not match rule: ${rule.label} - ${rule.prompt} [LLM: ${rawAnswer}]${aiReasoning ? ` (${aiReasoning})` : ''}`);
    }
  }

  return labels;
}

async function matchSingleRuleWithOpenAI(email: Email, rule: LabelRule): Promise<{ match: boolean; reasoning: string; rawAnswer: string }> {
  if (!openaiClient) return { match: false, reasoning: 'Client not initialized', rawAnswer: 'no' };

  const prompt = buildClassificationPrompt(email, rule);

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    });

    const result = response.choices[0]?.message?.content?.trim() || '';
    
    try {
      const parsed = JSON.parse(result) as { match?: string; reason?: string };
      const matchValue = parsed.match?.toLowerCase().trim();
      const match = matchValue === 'yes';
      const rawAnswer = matchValue || 'unknown';
      const reasoning = parsed.reason || '';
      
      return { match, reasoning, rawAnswer };
    } catch (parseError) {
      // Fallback: try to extract JSON from the response if it's wrapped in text
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { match?: string; reason?: string };
        const matchValue = parsed.match?.toLowerCase().trim();
        const match = matchValue === 'yes';
        const rawAnswer = matchValue || 'unknown';
        const reasoning = parsed.reason || '';
        return { match, reasoning, rawAnswer };
      }
      
      console.error(`[AI] Failed to parse JSON response for rule "${rule.label}":`, result);
      return { match: false, reasoning: 'Failed to parse response', rawAnswer: 'unknown' };
    }
  } catch (error) {
    console.error(`[AI] Error matching rule "${rule.label}" with OpenAI:`, error);
    return { match: false, reasoning: 'Error occurred', rawAnswer: 'no' };
  }
}

async function matchSingleRuleWithOllama(
  email: Email,
  rule: LabelRule,
  config: { url: string; model: string }
): Promise<{ match: boolean; reasoning: string; rawAnswer: string }> {
  const prompt = buildClassificationPrompt(email, rule);

  try {
    const response = await fetch(`${config.url}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        prompt: prompt,
        options: {
          temperature: 0,
          num_predict: 150,
        },
        stream: false,
      }),
      signal: AbortSignal.timeout(300000), // 5 minute timeout for model inference
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { response?: string };
    const result = (data?.response || '').trim();
    
    try {
      // Try to parse JSON directly
      const parsed = JSON.parse(result) as { match?: string; reason?: string };
      const matchValue = parsed.match?.toLowerCase().trim();
      const match = matchValue === 'yes';
      const rawAnswer = matchValue || 'unknown';
      const reasoning = parsed.reason || '';
      
      return { match, reasoning, rawAnswer };
    } catch (parseError) {
      // Fallback: try to extract JSON from the response if it's wrapped in text
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { match?: string; reason?: string };
        const matchValue = parsed.match?.toLowerCase().trim();
        const match = matchValue === 'yes';
        const rawAnswer = matchValue || 'unknown';
        const reasoning = parsed.reason || '';
        return { match, reasoning, rawAnswer };
      }
      
      console.error(`[AI] Failed to parse JSON response for rule "${rule.label}":`, result);
      return { match: false, reasoning: 'Failed to parse response', rawAnswer: 'unknown' };
    }
  } catch (error: any) {
    console.error(`[AI] Error matching rule "${rule.label}" with Ollama:`, error.message || error);
    return { match: false, reasoning: 'Error occurred', rawAnswer: 'no' };
  }
}
