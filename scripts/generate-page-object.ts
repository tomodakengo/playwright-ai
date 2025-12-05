import { chromium, Page, Locator, Browser, BrowserContext } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ElementInfo {
  tagName: string;
  role: string | null;
  label: string | null;
  text: string | null;
  placeholder: string | null;
  name: string | null;
  id: string | null;
  className: string | null;
  type: string | null;
  ariaLabel: string | null;
  testId: string | null;
}

interface AnalyzedElement {
  name: string;
  locatorCode: string;
  locatorType: 'getByRole' | 'getByLabel' | 'getByText' | 'getByPlaceholder' | 'getByTestId' | 'locator';
  elementType: 'button' | 'input' | 'link' | 'select' | 'checkbox' | 'radio' | 'textarea' | 'heading' | 'other';
  originalInfo: ElementInfo;
}

interface AnalyzedPage {
  buttons: AnalyzedElement[];
  inputs: AnalyzedElement[];
  links: AnalyzedElement[];
  selects: AnalyzedElement[];
  checkboxes: AnalyzedElement[];
  radios: AnalyzedElement[];
  textareas: AnalyzedElement[];
  headings: AnalyzedElement[];
  others: AnalyzedElement[];
}

interface GeneratorOptions {
  screenshot?: boolean;
  screenshotPath?: string;
  jsonOutput?: boolean;
  verbose?: boolean;
}

interface PageObjectMetadata {
  url: string;
  pageName: string;
  generatedAt: string;
  elementCount: number;
  elements: AnalyzedElement[];
  screenshotPath?: string;
}

interface DiffResult {
  added: AnalyzedElement[];
  removed: AnalyzedElement[];
  modified: Array<{ old: AnalyzedElement; new: AnalyzedElement }>;
  unchanged: AnalyzedElement[];
}

class PageObjectGenerator {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private options: GeneratorOptions;

  constructor(options: GeneratorOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  async navigateToUrl(url: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  async captureScreenshot(outputPath?: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    const screenshotPath = outputPath || `screenshot-${Date.now()}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    if (this.options.verbose) {
      console.log(`Screenshot saved to: ${screenshotPath}`);
    }
    return screenshotPath;
  }

  async generateFromPage(pageName: string, url: string): Promise<{ code: string; metadata: PageObjectMetadata }> {
    if (!this.page) throw new Error('Page not initialized');
    const elements = await this.analyzePageElements();
    
    let screenshotPath: string | undefined;
    if (this.options.screenshot) {
      screenshotPath = await this.captureScreenshot(this.options.screenshotPath);
    }

    const allElements = this.flattenElements(elements);
    const metadata: PageObjectMetadata = {
      url,
      pageName,
      generatedAt: new Date().toISOString(),
      elementCount: allElements.length,
      elements: allElements,
      screenshotPath,
    };

    const code = this.generateTemplate(pageName, elements);
    return { code, metadata };
  }

  async generateFromUrl(url: string, pageName: string): Promise<{ code: string; metadata: PageObjectMetadata }> {
    await this.navigateToUrl(url);
    return this.generateFromPage(pageName, url);
  }

  private flattenElements(elements: AnalyzedPage): AnalyzedElement[] {
    return [
      ...elements.buttons,
      ...elements.inputs,
      ...elements.links,
      ...elements.selects,
      ...elements.checkboxes,
      ...elements.radios,
      ...elements.textareas,
      ...elements.headings,
      ...elements.others,
    ];
  }

  private async analyzePageElements(): Promise<AnalyzedPage> {
    if (!this.page) throw new Error('Page not initialized');

    const result: AnalyzedPage = {
      buttons: [],
      inputs: [],
      links: [],
      selects: [],
      checkboxes: [],
      radios: [],
      textareas: [],
      headings: [],
      others: [],
    };

    if (this.options.verbose) {
      console.log('Analyzing page elements...');
    }

    const buttonLocators = await this.page.getByRole('button').all();
    for (const locator of buttonLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'button');
      if (analyzed) result.buttons.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.buttons.length} buttons`);

    const linkLocators = await this.page.getByRole('link').all();
    for (const locator of linkLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'link');
      if (analyzed) result.links.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.links.length} links`);

    const textboxLocators = await this.page.getByRole('textbox').all();
    for (const locator of textboxLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'input');
      if (analyzed) result.inputs.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.inputs.length} inputs`);

    const comboboxLocators = await this.page.getByRole('combobox').all();
    for (const locator of comboboxLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'select');
      if (analyzed) result.selects.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.selects.length} selects`);

    const checkboxLocators = await this.page.getByRole('checkbox').all();
    for (const locator of checkboxLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'checkbox');
      if (analyzed) result.checkboxes.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.checkboxes.length} checkboxes`);

    const radioLocators = await this.page.getByRole('radio').all();
    for (const locator of radioLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'radio');
      if (analyzed) result.radios.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.radios.length} radios`);

    const headingLocators = await this.page.getByRole('heading').all();
    for (const locator of headingLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'heading');
      if (analyzed) result.headings.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.headings.length} headings`);

    return result;
  }

  private async extractElementInfo(locator: Locator): Promise<ElementInfo> {
    const info = await locator.evaluate((el: Element) => {
      const htmlEl = el as HTMLElement;
      const id = htmlEl.getAttribute('id');
      return {
        tagName: htmlEl.tagName.toLowerCase(),
        role: htmlEl.getAttribute('role'),
        label: htmlEl.closest('label')?.textContent?.trim() || 
               (id ? document.querySelector(`label[for="${id}"]`)?.textContent?.trim() : null) || null,
        text: htmlEl.textContent?.trim() || null,
        placeholder: htmlEl.getAttribute('placeholder'),
        name: htmlEl.getAttribute('name'),
        id: id,
        className: htmlEl.getAttribute('class'),
        type: htmlEl.getAttribute('type'),
        ariaLabel: htmlEl.getAttribute('aria-label'),
        testId: htmlEl.getAttribute('data-testid') || htmlEl.getAttribute('data-test-id'),
      };
    });
    return info;
  }

  private createAnalyzedElement(
    info: ElementInfo,
    elementType: AnalyzedElement['elementType']
  ): AnalyzedElement | null {
    const { locatorCode, locatorType } = this.generateLocator(info, elementType);
    const name = this.generateElementName(info, elementType);

    if (!name || !locatorCode) return null;

    return {
      name,
      locatorCode,
      locatorType,
      elementType,
      originalInfo: info,
    };
  }

  private generateLocator(
    info: ElementInfo,
    elementType: AnalyzedElement['elementType']
  ): { locatorCode: string; locatorType: AnalyzedElement['locatorType'] } {
    const roleMap: Record<string, string> = {
      button: 'button',
      link: 'link',
      input: 'textbox',
      select: 'combobox',
      checkbox: 'checkbox',
      radio: 'radio',
      textarea: 'textbox',
      heading: 'heading',
      other: '',
    };

    const role = roleMap[elementType];

    if (role && info.ariaLabel) {
      return {
        locatorCode: `getByRole('${role}', { name: '${this.escapeString(info.ariaLabel)}' })`,
        locatorType: 'getByRole',
      };
    }

    if (role && info.text && ['button', 'link', 'heading'].includes(elementType)) {
      const textContent = info.text.substring(0, 50);
      return {
        locatorCode: `getByRole('${role}', { name: '${this.escapeString(textContent)}' })`,
        locatorType: 'getByRole',
      };
    }

    if (info.label) {
      return {
        locatorCode: `getByLabel('${this.escapeString(info.label)}')`,
        locatorType: 'getByLabel',
      };
    }

    if (info.placeholder) {
      return {
        locatorCode: `getByPlaceholder('${this.escapeString(info.placeholder)}')`,
        locatorType: 'getByPlaceholder',
      };
    }

    if (info.testId) {
      return {
        locatorCode: `getByTestId('${this.escapeString(info.testId)}')`,
        locatorType: 'getByTestId',
      };
    }

    if (info.text && info.text.length <= 50) {
      return {
        locatorCode: `getByText('${this.escapeString(info.text)}')`,
        locatorType: 'getByText',
      };
    }

    if (info.id) {
      return {
        locatorCode: `locator('#${this.escapeString(info.id)}')`,
        locatorType: 'locator',
      };
    }

    if (info.name) {
      return {
        locatorCode: `locator('[name="${this.escapeString(info.name)}"]')`,
        locatorType: 'locator',
      };
    }

    if (info.className) {
      const firstClass = info.className.split(' ')[0];
      return {
        locatorCode: `locator('.${this.escapeString(firstClass)}')`,
        locatorType: 'locator',
      };
    }

    return {
      locatorCode: `locator('${info.tagName}')`,
      locatorType: 'locator',
    };
  }

  private generateElementName(
    info: ElementInfo,
    elementType: AnalyzedElement['elementType']
  ): string {
    let baseName = '';

    if (info.ariaLabel) {
      baseName = info.ariaLabel;
    } else if (info.label) {
      baseName = info.label;
    } else if (info.placeholder) {
      baseName = info.placeholder;
    } else if (info.text && info.text.length <= 30) {
      baseName = info.text;
    } else if (info.name) {
      baseName = info.name;
    } else if (info.id) {
      baseName = info.id;
    } else if (info.testId) {
      baseName = info.testId;
    } else {
      baseName = `unnamed${elementType}`;
    }

    const camelCase = this.toCamelCase(baseName);
    const suffix = this.getElementSuffix(elementType);

    return `${camelCase}${suffix}`;
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => {
        const lower = word.toLowerCase();
        return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join('');
  }

  private getElementSuffix(elementType: AnalyzedElement['elementType']): string {
    const suffixMap: Record<string, string> = {
      button: 'Button',
      input: 'Input',
      link: 'Link',
      select: 'Select',
      checkbox: 'Checkbox',
      radio: 'Radio',
      textarea: 'Textarea',
      heading: 'Heading',
      other: 'Element',
    };
    return suffixMap[elementType] || 'Element';
  }

  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/\n/g, ' ').trim();
  }

  private generateTemplate(pageName: string, elements: AnalyzedPage): string {
    const className = this.toPascalCase(pageName) + 'Page';
    const allElements = [
      ...elements.buttons,
      ...elements.inputs,
      ...elements.links,
      ...elements.selects,
      ...elements.checkboxes,
      ...elements.radios,
      ...elements.textareas,
      ...elements.headings,
    ];

    const uniqueElements = this.deduplicateElements(allElements);

    let template = `import { Page, Locator } from '@playwright/test';

export class ${className} {
  readonly page: Page;
`;

    for (const element of uniqueElements) {
      template += `  readonly ${element.name}: Locator;\n`;
    }

    template += `
  constructor(page: Page) {
    this.page = page;
`;

    for (const element of uniqueElements) {
      template += `    this.${element.name} = page.${element.locatorCode};\n`;
    }

    template += `  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }
`;

    const buttonElements = uniqueElements.filter((e) => e.elementType === 'button');
    for (const button of buttonElements) {
      const methodName = `click${this.toPascalCase(button.name.replace(/Button$/, ''))}`;
      template += `
  async ${methodName}(): Promise<void> {
    await this.${button.name}.click();
  }
`;
    }

    const inputElements = uniqueElements.filter(
      (e) => e.elementType === 'input' || e.elementType === 'textarea'
    );
    for (const input of inputElements) {
      const methodName = `fill${this.toPascalCase(input.name.replace(/(Input|Textarea)$/, ''))}`;
      template += `
  async ${methodName}(value: string): Promise<void> {
    await this.${input.name}.fill(value);
  }
`;
    }

    const selectElements = uniqueElements.filter((e) => e.elementType === 'select');
    for (const select of selectElements) {
      const methodName = `select${this.toPascalCase(select.name.replace(/Select$/, ''))}`;
      template += `
  async ${methodName}(value: string): Promise<void> {
    await this.${select.name}.selectOption(value);
  }
`;
    }

    const checkboxElements = uniqueElements.filter((e) => e.elementType === 'checkbox');
    for (const checkbox of checkboxElements) {
      const baseName = this.toPascalCase(checkbox.name.replace(/Checkbox$/, ''));
      template += `
  async check${baseName}(): Promise<void> {
    await this.${checkbox.name}.check();
  }

  async uncheck${baseName}(): Promise<void> {
    await this.${checkbox.name}.uncheck();
  }
`;
    }

    const linkElements = uniqueElements.filter((e) => e.elementType === 'link');
    for (const link of linkElements) {
      const methodName = `click${this.toPascalCase(link.name.replace(/Link$/, ''))}Link`;
      template += `
  async ${methodName}(): Promise<void> {
    await this.${link.name}.click();
  }
`;
    }

    template += `}
`;

    return template;
  }

  private toPascalCase(str: string): string {
    const camel = this.toCamelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }

  private deduplicateElements(elements: AnalyzedElement[]): AnalyzedElement[] {
    const seen = new Map<string, AnalyzedElement>();
    for (const element of elements) {
      if (!seen.has(element.name)) {
        seen.set(element.name, element);
      } else {
        let counter = 2;
        let newName = `${element.name}${counter}`;
        while (seen.has(newName)) {
          counter++;
          newName = `${element.name}${counter}`;
        }
        seen.set(newName, { ...element, name: newName });
      }
    }
    return Array.from(seen.values());
  }
}

class PageObjectDiff {
  static compare(oldMetadata: PageObjectMetadata, newMetadata: PageObjectMetadata): DiffResult {
    const oldElements = new Map(oldMetadata.elements.map(e => [e.name, e]));
    const newElements = new Map(newMetadata.elements.map(e => [e.name, e]));

    const added: AnalyzedElement[] = [];
    const removed: AnalyzedElement[] = [];
    const modified: Array<{ old: AnalyzedElement; new: AnalyzedElement }> = [];
    const unchanged: AnalyzedElement[] = [];

    for (const [name, newEl] of newElements) {
      const oldEl = oldElements.get(name);
      if (!oldEl) {
        added.push(newEl);
      } else if (oldEl.locatorCode !== newEl.locatorCode) {
        modified.push({ old: oldEl, new: newEl });
      } else {
        unchanged.push(newEl);
      }
    }

    for (const [name, oldEl] of oldElements) {
      if (!newElements.has(name)) {
        removed.push(oldEl);
      }
    }

    return { added, removed, modified, unchanged };
  }

  static formatDiff(diff: DiffResult): string {
    const lines: string[] = [];

    if (diff.added.length > 0) {
      lines.push('Added elements:');
      for (const el of diff.added) {
        lines.push(`  + ${el.name} (${el.locatorType})`);
      }
    }

    if (diff.removed.length > 0) {
      lines.push('Removed elements:');
      for (const el of diff.removed) {
        lines.push(`  - ${el.name} (${el.locatorType})`);
      }
    }

    if (diff.modified.length > 0) {
      lines.push('Modified elements:');
      for (const { old, new: newEl } of diff.modified) {
        lines.push(`  ~ ${old.name}:`);
        lines.push(`    old: ${old.locatorCode}`);
        lines.push(`    new: ${newEl.locatorCode}`);
      }
    }

    if (lines.length === 0) {
      lines.push('No changes detected.');
    } else {
      lines.unshift(`Summary: +${diff.added.length} -${diff.removed.length} ~${diff.modified.length}`);
    }

    return lines.join('\n');
  }

  static hasChanges(diff: DiffResult): boolean {
    return diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;
  }
}

function parseArgs(args: string[]): {
  command: string;
  url?: string;
  pageName?: string;
  outputPath?: string;
  options: GeneratorOptions;
  metadataPath?: string;
  compareWith?: string;
} {
  const options: GeneratorOptions = {};
  let command = 'generate';
  let url: string | undefined;
  let pageName: string | undefined;
  let outputPath: string | undefined;
  let metadataPath: string | undefined;
  let compareWith: string | undefined;

  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--screenshot' || arg === '-s') {
      options.screenshot = true;
    } else if (arg === '--screenshot-path' && args[i + 1]) {
      options.screenshotPath = args[++i];
      options.screenshot = true;
    } else if (arg === '--json' || arg === '-j') {
      options.jsonOutput = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--metadata' || arg === '-m') {
      metadataPath = args[++i];
    } else if (arg === '--compare' || arg === '-c') {
      compareWith = args[++i];
      command = 'compare';
    } else if (arg === 'generate' || arg === 'compare' || arg === 'diff') {
      command = arg === 'diff' ? 'compare' : arg;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  if (command === 'generate' || command === 'compare') {
    url = positionalArgs[0];
    pageName = positionalArgs[1];
    outputPath = positionalArgs[2];
  }

  return { command, url, pageName, outputPath, options, metadataPath, compareWith };
}

function printUsage(): void {
  console.log(`
Page Object Generator - Generate Playwright Page Objects from web pages

Usage:
  npx ts-node scripts/generate-page-object.ts [command] [options] <url> <pageName> [outputPath]

Commands:
  generate    Generate a Page Object from a URL (default)
  compare     Compare current page with saved metadata for changes

Options:
  -s, --screenshot           Capture a screenshot of the page
  --screenshot-path <path>   Path to save the screenshot
  -j, --json                 Output metadata as JSON
  -v, --verbose              Enable verbose output
  -m, --metadata <path>      Save metadata to a JSON file
  -c, --compare <path>       Compare with existing metadata file

Examples:
  # Basic generation
  npx ts-node scripts/generate-page-object.ts https://example.com Login

  # Generate with screenshot and save to file
  npx ts-node scripts/generate-page-object.ts -s https://example.com Login ./pages/LoginPage.ts

  # Generate with JSON metadata output
  npx ts-node scripts/generate-page-object.ts -j -m ./metadata/login.json https://example.com Login

  # Compare current page with saved metadata
  npx ts-node scripts/generate-page-object.ts -c ./metadata/login.json https://example.com Login

  # CI mode: detect changes and output JSON
  npx ts-node scripts/generate-page-object.ts -j -v -c ./metadata/login.json https://example.com Login
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const { command, url, pageName, outputPath, options, metadataPath, compareWith } = parseArgs(args);

  if (command === 'generate' && (!url || !pageName)) {
    console.error('Error: URL and page name are required for generation');
    printUsage();
    process.exit(1);
  }

  const generator = new PageObjectGenerator(options);

  try {
    if (options.verbose) {
      console.log('Initializing browser...');
    }
    await generator.initialize();

    if ((command === 'generate' || command === 'compare') && url && pageName) {
      if (options.verbose) {
        console.log(`Navigating to ${url}...`);
      }

      const { code, metadata } = await generator.generateFromUrl(url, pageName);

      if (compareWith) {
        try {
          const oldMetadataContent = await fs.readFile(compareWith, 'utf-8');
          const oldMetadata: PageObjectMetadata = JSON.parse(oldMetadataContent);
          const diff = PageObjectDiff.compare(oldMetadata, metadata);

          if (options.jsonOutput) {
            console.log(JSON.stringify({ diff, hasChanges: PageObjectDiff.hasChanges(diff) }, null, 2));
          } else {
            console.log('\n--- Page Object Changes ---\n');
            console.log(PageObjectDiff.formatDiff(diff));
          }

          if (PageObjectDiff.hasChanges(diff)) {
            process.exitCode = 2;
          }
        } catch (error) {
          console.error(`Error reading comparison file: ${compareWith}`);
          if (options.verbose) {
            console.error(error);
          }
        }
      }

      if (metadataPath) {
        const dir = path.dirname(metadataPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
        if (options.verbose) {
          console.log(`Metadata saved to: ${metadataPath}`);
        }
      }

      if (options.jsonOutput && !compareWith) {
        console.log(JSON.stringify(metadata, null, 2));
      } else if (!compareWith) {
        if (outputPath) {
          const dir = path.dirname(outputPath);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(outputPath, code, 'utf-8');
          console.log(`Page Object saved to: ${outputPath}`);
        } else {
          console.log('\n--- Generated Page Object ---\n');
          console.log(code);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await generator.close();
  }
}

export { PageObjectGenerator, PageObjectDiff, PageObjectMetadata, AnalyzedElement, DiffResult };

main();
