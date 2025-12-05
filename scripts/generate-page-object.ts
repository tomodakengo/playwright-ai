import { chromium, Page, Locator, Browser, BrowserContext } from '@playwright/test';

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

class PageObjectGenerator {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

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

  async generateFromPage(pageName: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    const elements = await this.analyzePageElements();
    return this.generateTemplate(pageName, elements);
  }

  async generateFromUrl(url: string, pageName: string): Promise<string> {
    await this.navigateToUrl(url);
    return this.generateFromPage(pageName);
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

    const buttonLocators = await this.page.getByRole('button').all();
    for (const locator of buttonLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'button');
      if (analyzed) result.buttons.push(analyzed);
    }

    const linkLocators = await this.page.getByRole('link').all();
    for (const locator of linkLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'link');
      if (analyzed) result.links.push(analyzed);
    }

    const textboxLocators = await this.page.getByRole('textbox').all();
    for (const locator of textboxLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'input');
      if (analyzed) result.inputs.push(analyzed);
    }

    const comboboxLocators = await this.page.getByRole('combobox').all();
    for (const locator of comboboxLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'select');
      if (analyzed) result.selects.push(analyzed);
    }

    const checkboxLocators = await this.page.getByRole('checkbox').all();
    for (const locator of checkboxLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'checkbox');
      if (analyzed) result.checkboxes.push(analyzed);
    }

    const radioLocators = await this.page.getByRole('radio').all();
    for (const locator of radioLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'radio');
      if (analyzed) result.radios.push(analyzed);
    }

    const headingLocators = await this.page.getByRole('heading').all();
    for (const locator of headingLocators) {
      const info = await this.extractElementInfo(locator);
      const analyzed = this.createAnalyzedElement(info, 'heading');
      if (analyzed) result.headings.push(analyzed);
    }

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

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx ts-node scripts/generate-page-object.ts <url> <pageName> [outputPath]');
    console.log('');
    console.log('Arguments:');
    console.log('  url        - The URL of the page to analyze');
    console.log('  pageName   - The name for the generated Page Object class');
    console.log('  outputPath - (Optional) Path to save the generated file');
    console.log('');
    console.log('Example:');
    console.log('  npx ts-node scripts/generate-page-object.ts https://example.com Login');
    console.log('  npx ts-node scripts/generate-page-object.ts https://example.com Login ./pages/LoginPage.ts');
    process.exit(1);
  }

  const [url, pageName, outputPath] = args;

  const generator = new PageObjectGenerator();

  try {
    console.log(`Initializing browser...`);
    await generator.initialize();

    console.log(`Navigating to ${url}...`);
    const pageObjectCode = await generator.generateFromUrl(url, pageName);

    if (outputPath) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, pageObjectCode, 'utf-8');
      console.log(`Page Object saved to: ${outputPath}`);
    } else {
      console.log('\n--- Generated Page Object ---\n');
      console.log(pageObjectCode);
    }
  } catch (error) {
    console.error('Error generating Page Object:', error);
    process.exit(1);
  } finally {
    await generator.close();
  }
}

main();
