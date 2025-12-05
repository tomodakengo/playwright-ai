/**
 * Test Code Generator
 * Generates Playwright test files from planned scenarios
 */

import {
  PlannedScenario,
  Action,
  GeneratedTest,
  GeneratedPageObject,
  ExecutionTrace,
  ScenarioRunnerConfig,
} from './types';

/**
 * Generate a Playwright test file from a planned scenario
 */
export function generateTestFile(
  scenario: PlannedScenario,
  config: ScenarioRunnerConfig,
  trace?: ExecutionTrace
): GeneratedTest {
  const testContent = generateTestContent(scenario, config);
  const pageObjects = generatePageObjects(scenario, trace);

  const filename = `${sanitizeFilename(scenario.name)}.spec.ts`;

  return {
    filename,
    content: testContent,
    pageObjects,
  };
}

/**
 * Generate the test file content
 */
function generateTestContent(
  scenario: PlannedScenario,
  config: ScenarioRunnerConfig
): string {
  const lines: string[] = [];

  // Imports
  lines.push("import { test, expect } from '@playwright/test';");
  lines.push('');

  // Test data
  if (scenario.data.signupInput || scenario.data.mypageValidate) {
    lines.push('// Test data');
    if (scenario.data.signupInput) {
      lines.push(`const signupData = ${JSON.stringify(scenario.data.signupInput, null, 2)};`);
    }
    if (scenario.data.mypageValidate) {
      lines.push(`const expectedData = ${JSON.stringify(scenario.data.mypageValidate, null, 2)};`);
    }
    lines.push('');
  }

  // Test describe block
  lines.push(`test.describe('${escapeString(scenario.name)}', () => {`);
  lines.push(`  test('${escapeString(scenario.name)}', async ({ page }) => {`);

  // Generate test steps
  for (const action of scenario.actions) {
    const stepCode = generateActionCode(action, config, scenario);
    lines.push('');
    lines.push(`    // ${action.rawStepText}`);
    for (const line of stepCode) {
      lines.push(`    ${line}`);
    }
  }

  lines.push('  });');
  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate code for a single action
 */
function generateActionCode(
  action: Action,
  config: ScenarioRunnerConfig,
  scenario: PlannedScenario
): string[] {
  const lines: string[] = [];

  switch (action.type) {
    case 'navigate':
      lines.push(...generateNavigateCode(action, config));
      break;
    case 'click':
      lines.push(...generateClickCode(action));
      break;
    case 'fill':
      lines.push(...generateFillCode(action));
      break;
    case 'fillForm':
      lines.push(...generateFillFormCode(action, scenario));
      break;
    case 'select':
      lines.push(...generateSelectCode(action));
      break;
    case 'check':
      lines.push(...generateCheckCode(action));
      break;
    case 'assertHeading':
      lines.push(...generateAssertHeadingCode(action));
      break;
    case 'assertText':
      lines.push(...generateAssertTextCode(action));
      break;
    case 'assertUrl':
      lines.push(...generateAssertUrlCode(action));
      break;
    case 'assertFields':
      lines.push(...generateAssertFieldsCode(action, scenario));
      break;
    case 'logout':
      lines.push(...generateLogoutCode(action));
      break;
    case 'unknown':
      lines.push(`// TODO: Implement step: ${action.rawStepText}`);
      break;
  }

  return lines;
}

function generateNavigateCode(action: Action, config: ScenarioRunnerConfig): string[] {
  const targetPage = action.params.targetPage as string;
  let url: string;

  if (targetPage === 'home') {
    url = config.baseUrl;
  } else {
    const pagePath = config.pages?.[targetPage];
    url = pagePath ? `'${config.baseUrl}${pagePath}'` : `'${config.baseUrl}'`;
  }

  return [
    `await page.goto(${url === config.baseUrl ? `'${url}'` : url});`,
    `await page.waitForLoadState('networkidle');`,
  ];
}

function generateClickCode(action: Action): string[] {
  const target = action.params.target as string;
  const elementType = action.params.elementType as string | undefined;

  if (elementType === 'link') {
    return [
      `await page.getByRole('link', { name: /${escapeRegex(target)}/ }).click();`,
      `await page.waitForLoadState('networkidle');`,
    ];
  } else if (elementType === 'button') {
    return [
      `await page.getByRole('button', { name: /${escapeRegex(target)}/ }).click();`,
      `await page.waitForLoadState('networkidle');`,
    ];
  } else {
    return [
      `await page.getByRole('button', { name: /${escapeRegex(target)}/ })`,
      `  .or(page.getByRole('link', { name: /${escapeRegex(target)}/ }))`,
      `  .first().click();`,
      `await page.waitForLoadState('networkidle');`,
    ];
  }
}

function generateFillCode(action: Action): string[] {
  const target = action.params.target as string;
  const value = action.params.value as string;

  return [
    `await page.getByLabel('${escapeString(target)}').fill('${escapeString(value)}');`,
  ];
}

function generateFillFormCode(action: Action, scenario: PlannedScenario): string[] {
  const lines: string[] = [];
  const screen = action.params.screen as string;

  if (screen === '会員登録' && scenario.data.signupInput) {
    const formData = scenario.data.signupInput['会員情報_入力'];
    
    // Email
    if (formData.email) {
      lines.push(`await page.locator('[name="email"]').fill('${escapeString(formData.email)}');`);
    }
    // Password
    if (formData.password) {
      lines.push(`await page.locator('[name="password"]').fill('${escapeString(formData.password)}');`);
    }
    // Password confirmation
    if (formData.password_confirm) {
      lines.push(`await page.locator('[name="password-confirmation"]').fill('${escapeString(formData.password_confirm)}');`);
    }
    // Name
    if (formData.name) {
      lines.push(`await page.locator('[name="username"]').fill('${escapeString(formData.name)}');`);
    }
    // Rank (radio)
    if (formData.rank) {
      const rankValue = formData.rank === 'プレミアム会員' ? 'premium' : 'normal';
      lines.push(`await page.locator('input[name="rank"][value="${rankValue}"]').check();`);
    }
    // Address
    if (formData.address) {
      lines.push(`await page.locator('[name="address"]').fill('${escapeString(formData.address)}');`);
    }
    // Phone
    if (formData.phone) {
      lines.push(`await page.locator('[name="tel"]').fill('${escapeString(formData.phone)}');`);
    }
    // Gender (select)
    if (formData.gender) {
      const genderMap: Record<string, string> = {
        '回答しない': '0',
        '男性': '1',
        '女性': '2',
        'その他': '9',
      };
      const genderValue = genderMap[formData.gender] || '0';
      lines.push(`await page.locator('[name="gender"]').selectOption('${genderValue}');`);
    }
    // Birthday
    if (formData.birthday) {
      lines.push(`await page.locator('[name="birthday"]').fill('${escapeString(formData.birthday)}');`);
    }
    // Notification checkbox
    if (formData.check_flag === '受け取る') {
      lines.push(`await page.locator('[name="notification"]').check();`);
    }
  } else {
    lines.push(`// TODO: Fill form for screen: ${screen}`);
  }

  return lines;
}

function generateSelectCode(action: Action): string[] {
  const target = action.params.target as string;
  const value = action.params.value as string;

  return [
    `await page.getByLabel('${escapeString(target)}').selectOption('${escapeString(value)}');`,
  ];
}

function generateCheckCode(action: Action): string[] {
  const target = action.params.target as string;
  const checked = action.params.checked as boolean;

  if (checked) {
    return [`await page.getByLabel('${escapeString(target)}').check();`];
  } else {
    return [`await page.getByLabel('${escapeString(target)}').uncheck();`];
  }
}

function generateAssertHeadingCode(action: Action): string[] {
  const expected = action.params.expected as string;

  return [
    `await expect(page.getByRole('heading', { name: '${escapeString(expected)}' })).toBeVisible();`,
  ];
}

function generateAssertTextCode(action: Action): string[] {
  const expected = action.params.expected as string;

  return [
    `await expect(page.getByText('${escapeString(expected)}')).toBeVisible();`,
  ];
}

function generateAssertUrlCode(action: Action): string[] {
  const contains = action.params.contains as string;

  return [
    `await expect(page).toHaveURL(/${escapeRegex(contains)}/);`,
  ];
}

function generateAssertFieldsCode(action: Action, scenario: PlannedScenario): string[] {
  const lines: string[] = [];
  const screen = action.params.screen as string;

  if (screen === 'マイページ' && scenario.data.mypageValidate) {
    const expectedData = scenario.data.mypageValidate['マイページ情報_検証'];
    
    const fieldLabels: Record<string, string> = {
      email: 'メールアドレス',
      name: '氏名',
      rank: '会員ランク',
      address: '住所',
      phone: '電話番号',
      gender: '性別',
      birthday: '生年月日',
      check_flag: 'お知らせ',
    };

    for (const [key, label] of Object.entries(fieldLabels)) {
      const value = expectedData[key as keyof typeof expectedData];
      if (value) {
        lines.push(`await expect(page.locator('li:has(h5:text("${label}"))')).toContainText('${escapeString(value)}');`);
      }
    }
  } else {
    lines.push(`// TODO: Assert fields for screen: ${screen}`);
  }

  return lines;
}

function generateLogoutCode(action: Action): string[] {
  return [
    `await page.getByRole('button', { name: /ログアウト/ }).click();`,
    `await page.waitForLoadState('networkidle');`,
  ];
}

/**
 * Generate Page Object classes based on execution trace
 */
function generatePageObjects(
  scenario: PlannedScenario,
  trace?: ExecutionTrace
): GeneratedPageObject[] {
  const pageObjects: GeneratedPageObject[] = [];

  // Generate basic page objects for common pages
  const pages = [
    { name: 'HomePage', url: '/ja/', elements: [] },
    { name: 'SignupPage', url: '/ja/signup.html', elements: getSignupPageElements() },
    { name: 'MypagePage', url: '/ja/mypage.html', elements: getMypageElements() },
  ];

  for (const pageConfig of pages) {
    const content = generatePageObjectContent(pageConfig.name, pageConfig.url, pageConfig.elements);
    pageObjects.push({
      filename: `${pageConfig.name}.ts`,
      className: pageConfig.name,
      content,
    });
  }

  return pageObjects;
}

interface PageElement {
  name: string;
  locator: string;
  type: 'input' | 'button' | 'link' | 'select' | 'checkbox' | 'radio' | 'text';
}

function getSignupPageElements(): PageElement[] {
  return [
    { name: 'emailInput', locator: '[name="email"]', type: 'input' },
    { name: 'passwordInput', locator: '[name="password"]', type: 'input' },
    { name: 'passwordConfirmInput', locator: '[name="password-confirmation"]', type: 'input' },
    { name: 'usernameInput', locator: '[name="username"]', type: 'input' },
    { name: 'premiumRankRadio', locator: 'input[name="rank"][value="premium"]', type: 'radio' },
    { name: 'normalRankRadio', locator: 'input[name="rank"][value="normal"]', type: 'radio' },
    { name: 'addressInput', locator: '[name="address"]', type: 'input' },
    { name: 'telInput', locator: '[name="tel"]', type: 'input' },
    { name: 'genderSelect', locator: '[name="gender"]', type: 'select' },
    { name: 'birthdayInput', locator: '[name="birthday"]', type: 'input' },
    { name: 'notificationCheckbox', locator: '[name="notification"]', type: 'checkbox' },
    { name: 'submitButton', locator: 'button[type="submit"]', type: 'button' },
  ];
}

function getMypageElements(): PageElement[] {
  return [
    { name: 'logoutButton', locator: 'button:has-text("ログアウト")', type: 'button' },
    { name: 'emailField', locator: 'li:has(h5:text("メールアドレス"))', type: 'text' },
    { name: 'nameField', locator: 'li:has(h5:text("氏名"))', type: 'text' },
    { name: 'rankField', locator: 'li:has(h5:text("会員ランク"))', type: 'text' },
    { name: 'addressField', locator: 'li:has(h5:text("住所"))', type: 'text' },
    { name: 'phoneField', locator: 'li:has(h5:text("電話番号"))', type: 'text' },
    { name: 'genderField', locator: 'li:has(h5:text("性別"))', type: 'text' },
    { name: 'birthdayField', locator: 'li:has(h5:text("生年月日"))', type: 'text' },
    { name: 'notificationField', locator: 'li:has(h5:text("お知らせ"))', type: 'text' },
  ];
}

function generatePageObjectContent(
  className: string,
  url: string,
  elements: PageElement[]
): string {
  const lines: string[] = [];

  lines.push("import { Page, Locator } from '@playwright/test';");
  lines.push('');
  lines.push(`export class ${className} {`);
  lines.push('  readonly page: Page;');
  
  // Declare element properties
  for (const element of elements) {
    lines.push(`  readonly ${element.name}: Locator;`);
  }
  lines.push('');

  // Constructor
  lines.push('  constructor(page: Page) {');
  lines.push('    this.page = page;');
  for (const element of elements) {
    lines.push(`    this.${element.name} = page.locator('${escapeString(element.locator)}');`);
  }
  lines.push('  }');
  lines.push('');

  // Goto method
  lines.push(`  async goto(baseUrl: string): Promise<void> {`);
  lines.push(`    await this.page.goto(baseUrl + '${url}');`);
  lines.push('  }');

  // Generate helper methods for elements
  for (const element of elements) {
    lines.push('');
    switch (element.type) {
      case 'input':
        lines.push(`  async fill${capitalize(element.name.replace('Input', ''))}(value: string): Promise<void> {`);
        lines.push(`    await this.${element.name}.fill(value);`);
        lines.push('  }');
        break;
      case 'button':
      case 'link':
        lines.push(`  async click${capitalize(element.name.replace('Button', '').replace('Link', ''))}(): Promise<void> {`);
        lines.push(`    await this.${element.name}.click();`);
        lines.push('  }');
        break;
      case 'select':
        lines.push(`  async select${capitalize(element.name.replace('Select', ''))}(value: string): Promise<void> {`);
        lines.push(`    await this.${element.name}.selectOption(value);`);
        lines.push('  }');
        break;
      case 'checkbox':
        lines.push(`  async check${capitalize(element.name.replace('Checkbox', ''))}(): Promise<void> {`);
        lines.push(`    await this.${element.name}.check();`);
        lines.push('  }');
        lines.push('');
        lines.push(`  async uncheck${capitalize(element.name.replace('Checkbox', ''))}(): Promise<void> {`);
        lines.push(`    await this.${element.name}.uncheck();`);
        lines.push('  }');
        break;
      case 'radio':
        lines.push(`  async select${capitalize(element.name.replace('Radio', ''))}(): Promise<void> {`);
        lines.push(`    await this.${element.name}.check();`);
        lines.push('  }');
        break;
      case 'text':
        lines.push(`  async get${capitalize(element.name.replace('Field', ''))}Text(): Promise<string> {`);
        lines.push(`    return await this.${element.name}.textContent() || '';`);
        lines.push('  }');
        break;
    }
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// Utility functions
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Write generated test files to disk
 */
export async function writeGeneratedTest(
  test: GeneratedTest,
  outputDir: string
): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  // Create output directories
  const testsDir = path.join(outputDir, 'tests');
  const pagesDir = path.join(outputDir, 'pages');
  
  await fs.mkdir(testsDir, { recursive: true });
  await fs.mkdir(pagesDir, { recursive: true });

  // Write test file
  const testPath = path.join(testsDir, test.filename);
  await fs.writeFile(testPath, test.content, 'utf-8');
  console.log(`Generated test: ${testPath}`);

  // Write page objects
  for (const po of test.pageObjects) {
    const poPath = path.join(pagesDir, po.filename);
    await fs.writeFile(poPath, po.content, 'utf-8');
    console.log(`Generated page object: ${poPath}`);
  }
}
