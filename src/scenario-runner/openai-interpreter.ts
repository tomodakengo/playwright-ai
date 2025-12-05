/**
 * OpenAI Step Interpreter
 * Uses OpenAI to interpret unknown Gherkin steps
 */

import { Step, Action, ActionType } from './types';
import { AIStepInterpreter } from './interpreter';

interface OpenAIConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

/**
 * OpenAI-based step interpreter
 */
export class OpenAIStepInterpreter implements AIStepInterpreter {
  private config: OpenAIConfig;
  private systemPrompt: string;

  constructor(config: OpenAIConfig) {
    this.config = {
      model: 'gpt-4o-mini',
      maxTokens: 500,
      ...config,
    };

    this.systemPrompt = `You are a test automation expert that interprets Gherkin test steps written in Japanese.

Given a Gherkin step, you must classify it into one of these action types and extract relevant parameters:

Action Types:
- navigate: Go to a page (params: targetPage)
- click: Click an element (params: target, elementType: 'button' | 'link' | undefined)
- fill: Fill a single input field (params: target, value)
- fillForm: Fill a form with multiple fields (params: screen, dataKey)
- select: Select from dropdown (params: target, value)
- check: Check/uncheck checkbox (params: target, checked: boolean)
- assertHeading: Assert page heading (params: expected)
- assertText: Assert text is visible (params: expected)
- assertUrl: Assert URL contains string (params: contains)
- assertFields: Assert multiple field values (params: screen, dataKey)
- logout: Logout action (params: screen or empty)
- unknown: Cannot determine action

Respond ONLY with valid JSON in this format:
{
  "type": "actionType",
  "params": { ... }
}

Examples:
Step: "ログインボタンを押下する"
Response: {"type": "click", "params": {"target": "ログイン", "elementType": "button"}}

Step: "ページの見出しが「ホーム」であることを確認する"
Response: {"type": "assertHeading", "params": {"expected": "ホーム"}}

Step: "メールアドレスに「test@example.com」を入力する"
Response: {"type": "fill", "params": {"target": "メールアドレス", "value": "test@example.com"}}`;
  }

  /**
   * Interpret a step using OpenAI
   */
  async interpretStep(step: Step, context?: string): Promise<Action> {
    const messages: OpenAIMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    if (context) {
      messages.push({
        role: 'user',
        content: `Context: ${context}`,
      });
    }

    messages.push({
      role: 'user',
      content: `Interpret this Gherkin step:\n"${step.text}"`,
    });

    try {
      const response = await this.callOpenAI(messages);
      const parsed = this.parseResponse(response);

      return {
        type: parsed.type as ActionType,
        rawStepText: step.text,
        params: parsed.params || {},
      };
    } catch (error) {
      console.error('OpenAI interpretation failed:', error);
      return {
        type: 'unknown',
        rawStepText: step.text,
        params: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(messages: OpenAIMessage[]): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as OpenAIResponse;
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Parse OpenAI response into action
   */
  private parseResponse(response: string): { type: string; params: Record<string, unknown> } {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        type: parsed.type || 'unknown',
        params: parsed.params || {},
      };
    } catch {
      console.warn('Failed to parse OpenAI response:', response);
      return { type: 'unknown', params: {} };
    }
  }

  /**
   * Batch interpret multiple steps
   */
  async interpretSteps(steps: Step[], context?: string): Promise<Action[]> {
    const actions: Action[] = [];
    
    for (const step of steps) {
      const action = await this.interpretStep(step, context);
      actions.push(action);
    }

    return actions;
  }
}

/**
 * Create an OpenAI interpreter from environment variable
 */
export function createOpenAIInterpreter(): OpenAIStepInterpreter | null {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set. AI interpretation will not be available.');
    return null;
  }

  return new OpenAIStepInterpreter({ apiKey });
}

/**
 * Create an OpenAI interpreter with explicit config
 */
export function createOpenAIInterpreterWithConfig(config: OpenAIConfig): OpenAIStepInterpreter {
  return new OpenAIStepInterpreter(config);
}
