/**
 * Step Interpreter
 * Converts Gherkin steps into executable actions
 */

import {
  Step,
  Action,
  ActionType,
  ConcreteScenario,
  PlannedScenario,
  ScenarioData,
  SignupFormData,
  MypageExpectedData,
} from './types';

/**
 * Step pattern for rule-based interpretation
 */
interface StepPattern {
  pattern: RegExp;
  actionType: ActionType;
  extractParams: (match: RegExpMatchArray, stepText: string) => Record<string, unknown>;
}

/**
 * Rule-based step patterns for Japanese Gherkin steps
 */
const STEP_PATTERNS: StepPattern[] = [
  // Navigation patterns
  {
    pattern: /(.+)のホームページにアクセスする$/,
    actionType: 'navigate',
    extractParams: (match) => ({ targetPage: 'home', siteName: match[1] }),
  },
  {
    pattern: /(.+)ページにアクセスする$/,
    actionType: 'navigate',
    extractParams: (match) => ({ targetPage: match[1] }),
  },
  {
    pattern: /(.+)画面に遷移する$/,
    actionType: 'navigate',
    extractParams: (match) => ({ targetPage: match[1] }),
  },

  // Logout pattern (must come before general button click pattern)
  {
    pattern: /(.+)画面でログアウトボタンを押下する$/,
    actionType: 'logout',
    extractParams: (match) => ({ screen: match[1] }),
  },
  {
    pattern: /ログアウトする$/,
    actionType: 'logout',
    extractParams: () => ({}),
  },

  // Click patterns
  {
    pattern: /(.+)リンクを押下する$/,
    actionType: 'click',
    extractParams: (match) => ({ target: match[1], elementType: 'link' }),
  },
  {
    pattern: /(.+)ボタンを押下する$/,
    actionType: 'click',
    extractParams: (match) => ({ target: match[1], elementType: 'button' }),
  },
  {
    pattern: /(.+)をクリックする$/,
    actionType: 'click',
    extractParams: (match) => ({ target: match[1] }),
  },

  // Heading assertion patterns
  {
    pattern: /ページの見出しが「(.+)」であることを確認する$/,
    actionType: 'assertHeading',
    extractParams: (match) => ({ expected: match[1] }),
  },
  {
    pattern: /見出しが「(.+)」であることを確認する$/,
    actionType: 'assertHeading',
    extractParams: (match) => ({ expected: match[1] }),
  },

  // Form filling patterns with JSON data
  {
    pattern: /(.+)画面で「(.+)」を入力する$/,
    actionType: 'fillForm',
    extractParams: (match) => ({ 
      screen: match[1], 
      dataKey: 'signup_input',
      rawData: match[2],
    }),
  },
  {
    pattern: /「(.+)」に「(.+)」を入力する$/,
    actionType: 'fill',
    extractParams: (match) => ({ target: match[1], value: match[2] }),
  },

  // Field assertion patterns with JSON data
  {
    pattern: /(.+)画面で各項目が「(.+)」であることを確認する$/,
    actionType: 'assertFields',
    extractParams: (match) => ({ 
      screen: match[1], 
      dataKey: 'mypage_validate',
      rawData: match[2],
    }),
  },

  // Text assertion patterns
  {
    pattern: /「(.+)」が表示されていることを確認する$/,
    actionType: 'assertText',
    extractParams: (match) => ({ expected: match[1] }),
  },
  {
    pattern: /(.+)が表示されていることを確認する$/,
    actionType: 'assertText',
    extractParams: (match) => ({ expected: match[1] }),
  },

  // URL assertion patterns
  {
    pattern: /URLに「(.+)」が含まれていることを確認する$/,
    actionType: 'assertUrl',
    extractParams: (match) => ({ contains: match[1] }),
  },

  // Select patterns
  {
    pattern: /「(.+)」で「(.+)」を選択する$/,
    actionType: 'select',
    extractParams: (match) => ({ target: match[1], value: match[2] }),
  },

  // Checkbox patterns
  {
    pattern: /「(.+)」にチェックを入れる$/,
    actionType: 'check',
    extractParams: (match) => ({ target: match[1], checked: true }),
  },
  {
    pattern: /「(.+)」のチェックを外す$/,
    actionType: 'check',
    extractParams: (match) => ({ target: match[1], checked: false }),
  },
];

/**
 * Interpret a single step into an action using rule-based matching
 */
export function interpretStep(step: Step): Action {
  for (const pattern of STEP_PATTERNS) {
    const match = step.text.match(pattern.pattern);
    if (match) {
      return {
        type: pattern.actionType,
        rawStepText: step.text,
        params: pattern.extractParams(match, step.text),
      };
    }
  }

  // If no pattern matches, return unknown action
  return {
    type: 'unknown',
    rawStepText: step.text,
    params: { originalText: step.text },
  };
}

/**
 * Parse JSON data from step parameters
 */
function parseJsonData(rawData: string): Record<string, unknown> | null {
  try {
    return JSON.parse(rawData);
  } catch {
    console.warn(`Failed to parse JSON data: ${rawData}`);
    return null;
  }
}

/**
 * Extract scenario data from parameters
 */
function extractScenarioData(params: Record<string, string>): ScenarioData {
  const data: ScenarioData = { raw: params };

  if (params.signup_input) {
    const parsed = parseJsonData(params.signup_input);
    if (parsed) {
      data.signupInput = parsed as unknown as SignupFormData;
    }
  }

  if (params.mypage_validate) {
    const parsed = parseJsonData(params.mypage_validate);
    if (parsed) {
      data.mypageValidate = parsed as unknown as MypageExpectedData;
    }
  }

  return data;
}

/**
 * Interpret all steps in a concrete scenario
 */
export function interpretScenario(scenario: ConcreteScenario): PlannedScenario {
  const actions = scenario.steps.map(step => interpretStep(step));
  const data = extractScenarioData(scenario.params);

  return {
    name: scenario.name,
    actions,
    data,
  };
}

/**
 * Check if any actions are unknown (need AI interpretation)
 */
export function hasUnknownActions(plannedScenario: PlannedScenario): boolean {
  return plannedScenario.actions.some(action => action.type === 'unknown');
}

/**
 * Get all unknown actions from a planned scenario
 */
export function getUnknownActions(plannedScenario: PlannedScenario): Action[] {
  return plannedScenario.actions.filter(action => action.type === 'unknown');
}

/**
 * Interface for AI-based step interpreter
 */
export interface AIStepInterpreter {
  interpretStep(step: Step, context?: string): Promise<Action>;
}

/**
 * Interpret scenario with AI fallback for unknown steps
 */
export async function interpretScenarioWithAI(
  scenario: ConcreteScenario,
  aiInterpreter?: AIStepInterpreter
): Promise<PlannedScenario> {
  const data = extractScenarioData(scenario.params);
  const actions: Action[] = [];

  for (const step of scenario.steps) {
    let action = interpretStep(step);
    
    if (action.type === 'unknown' && aiInterpreter) {
      try {
        action = await aiInterpreter.interpretStep(step);
      } catch (error) {
        console.warn(`AI interpretation failed for step: ${step.text}`, error);
      }
    }
    
    actions.push(action);
  }

  return {
    name: scenario.name,
    actions,
    data,
  };
}
