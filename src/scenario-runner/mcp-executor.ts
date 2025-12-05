/**
 * MCP Executor
 * Executes planned scenarios using Playwright MCP server
 * Uses accessibility tree for intelligent element selection
 */

import {
  Action,
  PlannedScenario,
  ExecutionTrace,
  ExecutionStep,
  ScenarioRunnerConfig,
  HOTEL_SIGNUP_FIELD_MAPPINGS,
  HOTEL_MYPAGE_FIELD_MAPPINGS,
  FieldMapping,
} from './types';
import {
  PlaywrightMCPClient,
  MCPSnapshot,
  AccessibilityNode,
  createMCPClient,
} from './mcp-client';

export interface MCPExecutorConfig extends ScenarioRunnerConfig {
  mcpServerUrl: string;
}

/**
 * MCP-based scenario executor
 * Uses Playwright MCP server for browser automation
 */
export class MCPScenarioExecutor {
  private client: PlaywrightMCPClient;
  private config: MCPExecutorConfig;
  private currentSnapshot: MCPSnapshot | null = null;

  constructor(config: MCPExecutorConfig) {
    this.config = config;
    this.client = createMCPClient(config.mcpServerUrl, config.timeout);
  }

  /**
   * Execute a planned scenario
   */
  async execute(scenario: PlannedScenario): Promise<ExecutionTrace> {
    const trace: ExecutionTrace = {
      scenarioName: scenario.name,
      startTime: new Date(),
      steps: [],
      success: true,
      screenshots: [],
    };

    try {
      await this.client.connect();

      for (const action of scenario.actions) {
        const stepTrace = await this.executeAction(action, scenario);
        trace.steps.push(stepTrace);

        if (!stepTrace.success) {
          trace.success = false;
          trace.error = stepTrace.error;
          break;
        }
      }
    } catch (error) {
      trace.success = false;
      trace.error = error instanceof Error ? error.message : String(error);
    } finally {
      trace.endTime = new Date();
    }

    return trace;
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: Action, scenario: PlannedScenario): Promise<ExecutionStep> {
    const step: ExecutionStep = {
      action,
      startTime: new Date(),
      endTime: new Date(),
      success: true,
    };

    try {
      switch (action.type) {
        case 'navigate':
          await this.executeNavigate(action);
          break;
        case 'click':
          await this.executeClick(action);
          break;
        case 'fill':
          await this.executeFill(action);
          break;
        case 'fillForm':
          await this.executeFillForm(action, scenario);
          break;
        case 'select':
          await this.executeSelect(action);
          break;
        case 'check':
          await this.executeCheck(action);
          break;
        case 'assertHeading':
          await this.executeAssertHeading(action);
          break;
        case 'assertText':
          await this.executeAssertText(action);
          break;
        case 'assertFields':
          await this.executeAssertFields(action, scenario);
          break;
        case 'logout':
          await this.executeLogout();
          break;
        case 'unknown':
          console.warn(`Unknown action: ${action.rawStepText}`);
          break;
        default:
          console.warn(`Unhandled action type: ${action.type}`);
      }

      // Update snapshot after each action
      this.currentSnapshot = await this.client.getSnapshot();
      step.pageUrl = this.currentSnapshot?.url;
    } catch (error) {
      step.success = false;
      step.error = error instanceof Error ? error.message : String(error);
    }

    step.endTime = new Date();
    return step;
  }

  /**
   * Navigate to a page
   */
  private async executeNavigate(action: Action): Promise<void> {
    const targetPage = action.params.targetPage as string;
    let url = this.config.baseUrl;

    if (targetPage !== 'home') {
      const pagePath = this.config.pages?.[targetPage];
      if (pagePath) {
        url = `${this.config.baseUrl}${pagePath}`;
      }
    }

    const result = await this.client.navigate(url);
    if (!result.success) {
      throw new Error(`Navigation failed: ${result.error}`);
    }

    await this.client.waitForLoadState();
    this.currentSnapshot = await this.client.getSnapshot();
  }

  /**
   * Click an element using accessibility tree
   */
  private async executeClick(action: Action): Promise<void> {
    const target = action.params.target as string;
    const elementType = action.params.elementType as string | undefined;

    // Refresh snapshot
    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    // Find element in accessibility tree
    let element: AccessibilityNode | null = null;
    
    if (elementType === 'link') {
      element = this.client.findElementByRole(this.currentSnapshot, 'link', target);
    } else if (elementType === 'button') {
      element = this.client.findElementByRole(this.currentSnapshot, 'button', target);
    } else {
      // Try to find by text
      element = this.client.findElementByText(this.currentSnapshot, target);
    }

    if (!element || !element.ref) {
      throw new Error(`Element not found: ${target}`);
    }

    const result = await this.client.click(element.ref);
    if (!result.success) {
      throw new Error(`Click failed: ${result.error}`);
    }

    await this.client.waitForLoadState();
  }

  /**
   * Fill a single input field
   */
  private async executeFill(action: Action): Promise<void> {
    const target = action.params.target as string;
    const value = action.params.value as string;

    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    const element = this.client.findElementByRole(this.currentSnapshot, 'textbox', target);
    if (!element || !element.ref) {
      throw new Error(`Input not found: ${target}`);
    }

    const result = await this.client.fill(element.ref, value);
    if (!result.success) {
      throw new Error(`Fill failed: ${result.error}`);
    }
  }

  /**
   * Fill a form with JSON data
   */
  private async executeFillForm(action: Action, scenario: PlannedScenario): Promise<void> {
    const rawData = action.params.rawData as string;
    
    let formData: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawData);
      // Extract the inner data object (e.g., from "会員情報_入力")
      const key = Object.keys(parsed)[0];
      formData = parsed[key] as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse form data: ${rawData}`);
    }

    // Refresh snapshot
    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    // Fill each field using field mappings
    for (const mapping of HOTEL_SIGNUP_FIELD_MAPPINGS) {
      const value = formData[mapping.jsonKey];
      if (value === undefined) continue;

      await this.fillFieldByMapping(mapping, String(value));
    }
  }

  /**
   * Fill a field using mapping configuration
   */
  private async fillFieldByMapping(mapping: FieldMapping, value: string): Promise<void> {
    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    switch (mapping.inputType) {
      case 'text':
      case 'date': {
        // Find textbox by name or label
        const elements = this.client.findAllElements(this.currentSnapshot, (node) => {
          return node.role === 'textbox' && (
            node.name?.includes(mapping.locatorValue) ||
            node.name?.includes(mapping.jsonKey)
          );
        });
        
        if (elements.length > 0 && elements[0].ref) {
          await this.client.fill(elements[0].ref, value);
        }
        break;
      }
      case 'select': {
        const mappedValue = mapping.options?.[value] || value;
        const elements = this.client.findAllElements(this.currentSnapshot, (node) => {
          return node.role === 'combobox' && (
            node.name?.includes(mapping.locatorValue) ||
            node.name?.includes(mapping.jsonKey)
          );
        });
        
        if (elements.length > 0 && elements[0].ref) {
          await this.client.select(elements[0].ref, [mappedValue]);
        }
        break;
      }
      case 'radio': {
        const mappedValue = mapping.options?.[value] || value;
        const elements = this.client.findAllElements(this.currentSnapshot, (node) => {
          return node.role === 'radio' && (
            node.name?.includes(mappedValue) ||
            node.value === mappedValue
          );
        });
        
        if (elements.length > 0 && elements[0].ref) {
          await this.client.click(elements[0].ref);
        }
        break;
      }
      case 'checkbox': {
        const shouldCheck = mapping.options?.[value] === 'checked' || value === 'true';
        const elements = this.client.findAllElements(this.currentSnapshot, (node) => {
          return node.role === 'checkbox' && (
            node.name?.includes(mapping.locatorValue) ||
            node.name?.includes(mapping.jsonKey)
          );
        });
        
        if (elements.length > 0 && elements[0].ref) {
          await this.client.check(elements[0].ref, shouldCheck);
        }
        break;
      }
    }
  }

  /**
   * Select an option from a dropdown
   */
  private async executeSelect(action: Action): Promise<void> {
    const target = action.params.target as string;
    const value = action.params.value as string;

    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    const element = this.client.findElementByRole(this.currentSnapshot, 'combobox', target);
    if (!element || !element.ref) {
      throw new Error(`Select not found: ${target}`);
    }

    const result = await this.client.select(element.ref, [value]);
    if (!result.success) {
      throw new Error(`Select failed: ${result.error}`);
    }
  }

  /**
   * Check or uncheck a checkbox
   */
  private async executeCheck(action: Action): Promise<void> {
    const target = action.params.target as string;
    const checked = action.params.checked as boolean;

    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    const element = this.client.findElementByRole(this.currentSnapshot, 'checkbox', target);
    if (!element || !element.ref) {
      throw new Error(`Checkbox not found: ${target}`);
    }

    const result = await this.client.check(element.ref, checked);
    if (!result.success) {
      throw new Error(`Check failed: ${result.error}`);
    }
  }

  /**
   * Assert page heading
   */
  private async executeAssertHeading(action: Action): Promise<void> {
    const expected = action.params.expected as string;

    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    const heading = this.client.findElementByRole(this.currentSnapshot, 'heading', expected);
    if (!heading) {
      throw new Error(`Heading not found: ${expected}`);
    }
  }

  /**
   * Assert text is visible
   */
  private async executeAssertText(action: Action): Promise<void> {
    const expected = action.params.expected as string;

    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    const element = this.client.findElementByText(this.currentSnapshot, expected);
    if (!element) {
      throw new Error(`Text not found: ${expected}`);
    }
  }

  /**
   * Assert field values on a page
   */
  private async executeAssertFields(action: Action, scenario: PlannedScenario): Promise<void> {
    const rawData = action.params.rawData as string;
    
    let expectedData: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawData);
      const key = Object.keys(parsed)[0];
      expectedData = parsed[key] as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse expected data: ${rawData}`);
    }

    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    // Check each expected field
    for (const mapping of HOTEL_MYPAGE_FIELD_MAPPINGS) {
      const expectedValue = expectedData[mapping.jsonKey];
      if (expectedValue === undefined) continue;

      // Find the field label and check if the value is present
      const element = this.client.findElementByText(this.currentSnapshot, String(expectedValue));
      if (!element) {
        throw new Error(`Expected value not found: ${mapping.jsonKey}=${expectedValue}`);
      }
    }
  }

  /**
   * Execute logout
   */
  private async executeLogout(): Promise<void> {
    this.currentSnapshot = await this.client.getSnapshot();
    if (!this.currentSnapshot) {
      throw new Error('Failed to get page snapshot');
    }

    const logoutButton = this.client.findElementByRole(this.currentSnapshot, 'button', 'ログアウト');
    if (!logoutButton || !logoutButton.ref) {
      throw new Error('Logout button not found');
    }

    const result = await this.client.click(logoutButton.ref);
    if (!result.success) {
      throw new Error(`Logout failed: ${result.error}`);
    }

    await this.client.waitForLoadState();
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    await this.client.close();
  }

  /**
   * Get current page snapshot
   */
  getSnapshot(): MCPSnapshot | null {
    return this.currentSnapshot;
  }
}

/**
 * Create an MCP executor
 */
export function createMCPExecutor(config: MCPExecutorConfig): MCPScenarioExecutor {
  return new MCPScenarioExecutor(config);
}
