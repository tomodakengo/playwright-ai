/**
 * Playwright Executor
 * Executes planned scenarios against a live browser
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import {
  Action,
  PlannedScenario,
  ScenarioRunnerConfig,
  ExecutionTrace,
  ExecutionStep,
  HOTEL_SIGNUP_FIELD_MAPPINGS,
  HOTEL_MYPAGE_FIELD_MAPPINGS,
  FieldMapping,
  DEFAULT_CONFIG,
} from './types';

export class ScenarioExecutor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: ScenarioRunnerConfig;
  private screenshots: string[] = [];

  constructor(config: ScenarioRunnerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless ?? true,
    });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout ?? 30000);
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Executor not initialized. Call initialize() first.');
    }
    return this.page;
  }

  /**
   * Execute a planned scenario
   */
  async executeScenario(scenario: PlannedScenario): Promise<ExecutionTrace> {
    const trace: ExecutionTrace = {
      scenarioName: scenario.name,
      startTime: new Date(),
      steps: [],
      success: true,
      screenshots: [],
    };

    try {
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
    }

    trace.endTime = new Date();
    trace.screenshots = this.screenshots;
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
      const page = this.getPage();

      switch (action.type) {
        case 'navigate':
          await this.executeNavigate(action, page);
          break;
        case 'click':
          await this.executeClick(action, page);
          break;
        case 'fill':
          await this.executeFill(action, page);
          break;
        case 'fillForm':
          await this.executeFillForm(action, page, scenario);
          break;
        case 'select':
          await this.executeSelect(action, page);
          break;
        case 'check':
          await this.executeCheck(action, page);
          break;
        case 'assertHeading':
          await this.executeAssertHeading(action, page);
          break;
        case 'assertText':
          await this.executeAssertText(action, page);
          break;
        case 'assertUrl':
          await this.executeAssertUrl(action, page);
          break;
        case 'assertFields':
          await this.executeAssertFields(action, page, scenario);
          break;
        case 'logout':
          await this.executeLogout(action, page);
          break;
        case 'unknown':
          throw new Error(`Unknown action type for step: ${action.rawStepText}`);
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      step.pageUrl = page.url();
    } catch (error) {
      step.success = false;
      step.error = error instanceof Error ? error.message : String(error);

      if (this.config.screenshotOnError) {
        try {
          const screenshotPath = await this.takeScreenshot(`error-${Date.now()}`);
          step.screenshot = screenshotPath;
        } catch {
          // Ignore screenshot errors
        }
      }
    }

    step.endTime = new Date();
    return step;
  }

  /**
   * Navigate to a page
   */
  private async executeNavigate(action: Action, page: Page): Promise<void> {
    const targetPage = action.params.targetPage as string;
    let url: string;

    if (targetPage === 'home') {
      url = this.config.baseUrl;
    } else {
      const pagePath = this.config.pages?.[targetPage];
      if (pagePath) {
        url = new URL(pagePath, this.config.baseUrl).toString();
      } else {
        url = this.config.baseUrl;
      }
    }

    await page.goto(url);
    await page.waitForLoadState('networkidle');
  }

  /**
   * Click an element
   */
  private async executeClick(action: Action, page: Page): Promise<void> {
    const target = action.params.target as string;
    const elementType = action.params.elementType as string | undefined;

    let locator;
    if (elementType === 'link') {
      locator = page.getByRole('link', { name: new RegExp(target) });
    } else if (elementType === 'button') {
      locator = page.getByRole('button', { name: new RegExp(target) });
    } else {
      // Try button first, then link, then text
      locator = page.getByRole('button', { name: new RegExp(target) })
        .or(page.getByRole('link', { name: new RegExp(target) }))
        .or(page.getByText(target));
    }

    await locator.first().click();
    await page.waitForLoadState('networkidle');
  }

  /**
   * Fill a single input field
   */
  private async executeFill(action: Action, page: Page): Promise<void> {
    const target = action.params.target as string;
    const value = action.params.value as string;

    const locator = page.getByLabel(target)
      .or(page.getByPlaceholder(target))
      .or(page.locator(`[name="${target}"]`));

    await locator.first().fill(value);
  }

  /**
   * Fill a form with JSON data
   */
  private async executeFillForm(action: Action, page: Page, scenario: PlannedScenario): Promise<void> {
    const screen = action.params.screen as string;
    
    // Get the form data from scenario data
    let formData: Record<string, string> | undefined;
    
    if (screen === '会員登録' && scenario.data.signupInput) {
      formData = scenario.data.signupInput['会員情報_入力'];
    }

    if (!formData) {
      // Try to parse from rawData
      const rawData = action.params.rawData as string;
      if (rawData) {
        try {
          const parsed = JSON.parse(rawData);
          formData = parsed['会員情報_入力'] || parsed;
        } catch {
          throw new Error(`Failed to parse form data: ${rawData}`);
        }
      }
    }

    if (!formData) {
      throw new Error('No form data available for fillForm action');
    }

    // Fill each field using the field mappings
    for (const mapping of HOTEL_SIGNUP_FIELD_MAPPINGS) {
      const value = formData[mapping.jsonKey];
      if (value === undefined) continue;

      await this.fillField(page, mapping, value);
    }
  }

  /**
   * Fill a single field based on mapping
   */
  private async fillField(page: Page, mapping: FieldMapping, value: string): Promise<void> {
    const locator = this.getFieldLocator(page, mapping);

    switch (mapping.inputType) {
      case 'text':
      case 'date':
        await locator.fill(value);
        break;
      case 'select':
        if (mapping.options) {
          const optionValue = mapping.options[value] || value;
          await locator.selectOption(optionValue);
        } else {
          await locator.selectOption(value);
        }
        break;
      case 'radio':
        if (mapping.options) {
          const radioValue = mapping.options[value];
          if (radioValue) {
            await page.locator(`input[name="${mapping.locatorValue}"][value="${radioValue}"]`).check();
          }
        }
        break;
      case 'checkbox':
        if (mapping.options) {
          const shouldCheck = mapping.options[value] === 'checked';
          if (shouldCheck) {
            await locator.check();
          } else {
            await locator.uncheck();
          }
        } else if (value === 'true' || value === '受け取る') {
          await locator.check();
        }
        break;
    }
  }

  /**
   * Get a locator for a field based on mapping
   */
  private getFieldLocator(page: Page, mapping: FieldMapping) {
    switch (mapping.locatorType) {
      case 'name':
        return page.locator(`[name="${mapping.locatorValue}"]`);
      case 'label':
        return page.getByLabel(mapping.locatorValue);
      case 'role':
        return page.getByRole('textbox', { name: mapping.locatorValue });
      case 'testid':
        return page.getByTestId(mapping.locatorValue);
      case 'placeholder':
        return page.getByPlaceholder(mapping.locatorValue);
      default:
        return page.locator(`[name="${mapping.locatorValue}"]`);
    }
  }

  /**
   * Select an option from a dropdown
   */
  private async executeSelect(action: Action, page: Page): Promise<void> {
    const target = action.params.target as string;
    const value = action.params.value as string;

    const locator = page.getByLabel(target)
      .or(page.locator(`[name="${target}"]`));

    await locator.first().selectOption(value);
  }

  /**
   * Check or uncheck a checkbox
   */
  private async executeCheck(action: Action, page: Page): Promise<void> {
    const target = action.params.target as string;
    const checked = action.params.checked as boolean;

    const locator = page.getByLabel(target)
      .or(page.locator(`[name="${target}"]`));

    if (checked) {
      await locator.first().check();
    } else {
      await locator.first().uncheck();
    }
  }

  /**
   * Assert a heading is visible
   */
  private async executeAssertHeading(action: Action, page: Page): Promise<void> {
    const expected = action.params.expected as string;
    const heading = page.getByRole('heading', { name: expected });
    
    const isVisible = await heading.isVisible();
    if (!isVisible) {
      throw new Error(`Heading "${expected}" is not visible`);
    }
  }

  /**
   * Assert text is visible on the page
   */
  private async executeAssertText(action: Action, page: Page): Promise<void> {
    const expected = action.params.expected as string;
    const text = page.getByText(expected);
    
    const isVisible = await text.first().isVisible();
    if (!isVisible) {
      throw new Error(`Text "${expected}" is not visible`);
    }
  }

  /**
   * Assert URL contains a string
   */
  private async executeAssertUrl(action: Action, page: Page): Promise<void> {
    const contains = action.params.contains as string;
    const currentUrl = page.url();
    
    if (!currentUrl.includes(contains)) {
      throw new Error(`URL "${currentUrl}" does not contain "${contains}"`);
    }
  }

  /**
   * Assert fields on a page match expected values
   */
  private async executeAssertFields(action: Action, page: Page, scenario: PlannedScenario): Promise<void> {
    const screen = action.params.screen as string;
    
    // Get the expected data from scenario data
    let expectedData: Record<string, string> | undefined;
    
    if (screen === 'マイページ' && scenario.data.mypageValidate) {
      expectedData = scenario.data.mypageValidate['マイページ情報_検証'];
    }

    if (!expectedData) {
      // Try to parse from rawData
      const rawData = action.params.rawData as string;
      if (rawData) {
        try {
          const parsed = JSON.parse(rawData);
          expectedData = parsed['マイページ情報_検証'] || parsed;
        } catch {
          throw new Error(`Failed to parse expected data: ${rawData}`);
        }
      }
    }

    if (!expectedData) {
      throw new Error('No expected data available for assertFields action');
    }

    // Check each field using the field mappings
    for (const mapping of HOTEL_MYPAGE_FIELD_MAPPINGS) {
      const expectedValue = expectedData[mapping.jsonKey];
      if (expectedValue === undefined) continue;

      await this.assertFieldValue(page, mapping, expectedValue);
    }
  }

  /**
   * Assert a field has the expected value
   */
  private async assertFieldValue(page: Page, mapping: FieldMapping, expectedValue: string): Promise<void> {
    // On MyPage, fields are displayed as text, not inputs
    // Find the label and then get the adjacent text
    const labelElement = page.locator(`h5:has-text("${mapping.locatorValue}")`);
    const parentLi = labelElement.locator('..');
    const actualValue = await parentLi.textContent();

    if (!actualValue?.includes(expectedValue)) {
      throw new Error(
        `Field "${mapping.locatorValue}" expected "${expectedValue}" but got "${actualValue}"`
      );
    }
  }

  /**
   * Execute logout
   */
  private async executeLogout(action: Action, page: Page): Promise<void> {
    const logoutButton = page.getByRole('button', { name: /ログアウト/ })
      .or(page.getByRole('link', { name: /ログアウト/ }));
    
    await logoutButton.first().click();
    await page.waitForLoadState('networkidle');
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(name: string): Promise<string> {
    const page = this.getPage();
    const outputDir = this.config.outputDir || './generated';
    const fs = await import('fs/promises');
    
    await fs.mkdir(outputDir, { recursive: true });
    
    const screenshotPath = `${outputDir}/screenshots/${name}.png`;
    await fs.mkdir(`${outputDir}/screenshots`, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    this.screenshots.push(screenshotPath);
    return screenshotPath;
  }
}
