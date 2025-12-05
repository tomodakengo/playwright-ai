/**
 * AI-Enhanced Element Finder for MCP
 * Uses OpenAI to intelligently find elements in the accessibility tree
 */

import OpenAI from 'openai';
import { AccessibilityNode, MCPSnapshot } from './mcp-client';

export interface AIFinderConfig {
  apiKey: string;
  model?: string;
}

export interface ElementMatch {
  node: AccessibilityNode;
  confidence: number;
  reasoning: string;
}

/**
 * AI-Enhanced Element Finder
 * Uses LLM to intelligently match natural language descriptions to accessibility tree elements
 */
export class AIElementFinder {
  private openai: OpenAI;
  private model: string;

  constructor(config: AIFinderConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-4o-mini';
  }

  /**
   * Find an element matching a natural language description
   */
  async findElement(
    snapshot: MCPSnapshot,
    description: string,
    context?: string
  ): Promise<ElementMatch | null> {
    // Flatten accessibility tree to a list of elements with refs
    const elements = this.flattenTree(snapshot.accessibility);
    
    if (elements.length === 0) {
      return null;
    }

    // Create a simplified representation for the LLM
    const elementList = elements.map((el, idx) => ({
      index: idx,
      role: el.role,
      name: el.name || '',
      ref: el.ref,
      value: el.value,
      checked: el.checked,
      disabled: el.disabled,
    }));

    const systemPrompt = `You are an expert at finding UI elements in web pages.
Given an accessibility tree and a description of an element to find, identify the best matching element.

The accessibility tree contains elements with:
- role: The ARIA role (button, link, textbox, checkbox, etc.)
- name: The accessible name (usually the visible text)
- ref: A unique reference ID for the element
- value: Current value (for inputs)
- checked: Whether checked (for checkboxes/radios)
- disabled: Whether disabled

Respond with JSON in this format:
{
  "matchIndex": <index of best match, or -1 if no match>,
  "confidence": <0.0 to 1.0>,
  "reasoning": "<brief explanation>"
}`;

    const userPrompt = `Page URL: ${snapshot.url}
Page Title: ${snapshot.title}
${context ? `Context: ${context}` : ''}

Find element matching: "${description}"

Available elements:
${JSON.stringify(elementList, null, 2)}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const result = JSON.parse(content) as {
        matchIndex: number;
        confidence: number;
        reasoning: string;
      };

      if (result.matchIndex < 0 || result.matchIndex >= elements.length) {
        return null;
      }

      return {
        node: elements[result.matchIndex],
        confidence: result.confidence,
        reasoning: result.reasoning,
      };
    } catch (error) {
      console.error('AI element finding failed:', error);
      return null;
    }
  }

  /**
   * Find multiple elements matching a description
   */
  async findElements(
    snapshot: MCPSnapshot,
    description: string,
    maxResults: number = 5
  ): Promise<ElementMatch[]> {
    const elements = this.flattenTree(snapshot.accessibility);
    
    if (elements.length === 0) {
      return [];
    }

    const elementList = elements.map((el, idx) => ({
      index: idx,
      role: el.role,
      name: el.name || '',
      ref: el.ref,
    }));

    const systemPrompt = `You are an expert at finding UI elements in web pages.
Given an accessibility tree and a description, find ALL matching elements.

Respond with JSON in this format:
{
  "matches": [
    {"index": <element index>, "confidence": <0.0-1.0>, "reasoning": "<brief>"},
    ...
  ]
}

Order by confidence (highest first). Include up to ${maxResults} matches.`;

    const userPrompt = `Find elements matching: "${description}"

Available elements:
${JSON.stringify(elementList, null, 2)}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      const result = JSON.parse(content) as {
        matches: Array<{ index: number; confidence: number; reasoning: string }>;
      };

      return result.matches
        .filter((m) => m.index >= 0 && m.index < elements.length)
        .map((m) => ({
          node: elements[m.index],
          confidence: m.confidence,
          reasoning: m.reasoning,
        }));
    } catch (error) {
      console.error('AI element finding failed:', error);
      return [];
    }
  }

  /**
   * Suggest the best action for a step
   */
  async suggestAction(
    snapshot: MCPSnapshot,
    stepText: string
  ): Promise<{
    action: string;
    element?: ElementMatch;
    value?: string;
  } | null> {
    const elements = this.flattenTree(snapshot.accessibility);
    
    const elementList = elements.map((el, idx) => ({
      index: idx,
      role: el.role,
      name: el.name || '',
      ref: el.ref,
    }));

    const systemPrompt = `You are an expert at translating natural language test steps into browser actions.

Given a test step and the current page's accessibility tree, determine:
1. What action to perform (click, fill, select, check, assert)
2. Which element to interact with
3. What value to use (if applicable)

Respond with JSON:
{
  "action": "click" | "fill" | "select" | "check" | "assert_visible" | "assert_text",
  "elementIndex": <index of target element, or -1 if none>,
  "value": "<value to fill/select, if applicable>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}`;

    const userPrompt = `Page URL: ${snapshot.url}
Page Title: ${snapshot.title}

Test step: "${stepText}"

Available elements:
${JSON.stringify(elementList, null, 2)}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const result = JSON.parse(content) as {
        action: string;
        elementIndex: number;
        value?: string;
        confidence: number;
        reasoning: string;
      };

      const element =
        result.elementIndex >= 0 && result.elementIndex < elements.length
          ? {
              node: elements[result.elementIndex],
              confidence: result.confidence,
              reasoning: result.reasoning,
            }
          : undefined;

      return {
        action: result.action,
        element,
        value: result.value,
      };
    } catch (error) {
      console.error('AI action suggestion failed:', error);
      return null;
    }
  }

  /**
   * Flatten accessibility tree to a list of elements
   */
  private flattenTree(node: AccessibilityNode): AccessibilityNode[] {
    const result: AccessibilityNode[] = [];
    
    const traverse = (n: AccessibilityNode): void => {
      // Only include interactive elements
      const interactiveRoles = [
        'button', 'link', 'textbox', 'checkbox', 'radio',
        'combobox', 'listbox', 'option', 'menuitem', 'tab',
        'heading', 'img', 'text',
      ];
      
      if (interactiveRoles.includes(n.role) && n.ref) {
        result.push(n);
      }
      
      if (n.children) {
        for (const child of n.children) {
          traverse(child);
        }
      }
    };
    
    traverse(node);
    return result;
  }
}

/**
 * Create an AI element finder
 */
export function createAIElementFinder(apiKey: string, model?: string): AIElementFinder {
  return new AIElementFinder({ apiKey, model });
}
