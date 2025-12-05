import { chromium, Page, Locator, Browser, BrowserContext } from '@playwright/test';
import {
  ElementInfo,
  AnalyzedElement,
  AnalyzedPage,
  GeneratorConfig,
  GeneratorOptions,
  PageObjectMetadata,
  ElementType,
  LocatorType,
  DEFAULT_CONFIG,
} from './types';

export class PageObjectGenerator {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private options: GeneratorOptions;
  private config: GeneratorConfig;

  constructor(options: GeneratorOptions = {}) {
    this.options = options;
    this.config = this.mergeConfig(options.config);
  }

  private mergeConfig(userConfig?: Partial<GeneratorConfig>): GeneratorConfig {
    if (!userConfig) return DEFAULT_CONFIG;

    return {
      locatorPriority: userConfig.locatorPriority || DEFAULT_CONFIG.locatorPriority,
      namingRules: {
        ...DEFAULT_CONFIG.namingRules,
        ...userConfig.namingRules,
        suffixes: {
          ...DEFAULT_CONFIG.namingRules.suffixes,
          ...userConfig.namingRules?.suffixes,
        },
      },
      ignoreRules: {
        ...DEFAULT_CONFIG.ignoreRules,
        ...userConfig.ignoreRules,
      },
      templateOptions: {
        ...DEFAULT_CONFIG.templateOptions,
        ...userConfig.templateOptions,
      },
    };
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
      config: this.config,
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
      if (this.shouldIgnoreElement(info)) continue;
      const analyzed = this.createAnalyzedElement(info, 'button');
      if (analyzed) result.buttons.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.buttons.length} buttons`);

    const linkLocators = await this.page.getByRole('link').all();
    for (const locator of linkLocators) {
      const info = await this.extractElementInfo(locator);
      if (this.shouldIgnoreElement(info)) continue;
      const analyzed = this.createAnalyzedElement(info, 'link');
      if (analyzed) result.links.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.links.length} links`);

    const textboxLocators = await this.page.getByRole('textbox').all();
    for (const locator of textboxLocators) {
      const info = await this.extractElementInfo(locator);
      if (this.shouldIgnoreElement(info)) continue;
      const analyzed = this.createAnalyzedElement(info, 'input');
      if (analyzed) result.inputs.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.inputs.length} inputs`);

    const comboboxLocators = await this.page.getByRole('combobox').all();
    for (const locator of comboboxLocators) {
      const info = await this.extractElementInfo(locator);
      if (this.shouldIgnoreElement(info)) continue;
      const analyzed = this.createAnalyzedElement(info, 'select');
      if (analyzed) result.selects.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.selects.length} selects`);

    const checkboxLocators = await this.page.getByRole('checkbox').all();
    for (const locator of checkboxLocators) {
      const info = await this.extractElementInfo(locator);
      if (this.shouldIgnoreElement(info)) continue;
      const analyzed = this.createAnalyzedElement(info, 'checkbox');
      if (analyzed) result.checkboxes.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.checkboxes.length} checkboxes`);

    const radioLocators = await this.page.getByRole('radio').all();
    for (const locator of radioLocators) {
      const info = await this.extractElementInfo(locator);
      if (this.shouldIgnoreElement(info)) continue;
      const analyzed = this.createAnalyzedElement(info, 'radio');
      if (analyzed) result.radios.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.radios.length} radios`);

    const headingLocators = await this.page.getByRole('heading').all();
    for (const locator of headingLocators) {
      const info = await this.extractElementInfo(locator);
      if (this.shouldIgnoreElement(info)) continue;
      const analyzed = this.createAnalyzedElement(info, 'heading');
      if (analyzed) result.headings.push(analyzed);
    }
    if (this.options.verbose) console.log(`  Found ${result.headings.length} headings`);

    return result;
  }

  private shouldIgnoreElement(info: ElementInfo): boolean {
    const { ignoreClasses, ignoreIds, ignoreRoles } = this.config.ignoreRules;

    if (info.id && ignoreIds.some(id => info.id?.includes(id))) {
      return true;
    }

    if (info.className && ignoreClasses.some(cls => info.className?.includes(cls))) {
      return true;
    }

    if (info.role && ignoreRoles.includes(info.role)) {
      return true;
    }

    return false;
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
    elementType: ElementType
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
    elementType: ElementType
  ): { locatorCode: string; locatorType: LocatorType } {
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

    for (const locatorType of this.config.locatorPriority) {
      const result = this.tryGenerateLocator(info, elementType, role, locatorType);
      if (result) return result;
    }

    return {
      locatorCode: `locator('${info.tagName}')`,
      locatorType: 'locator',
    };
  }

  private tryGenerateLocator(
    info: ElementInfo,
    elementType: ElementType,
    role: string,
    locatorType: LocatorType
  ): { locatorCode: string; locatorType: LocatorType } | null {
    switch (locatorType) {
      case 'getByRole':
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
        return null;

      case 'getByLabel':
        if (info.label) {
          return {
            locatorCode: `getByLabel('${this.escapeString(info.label)}')`,
            locatorType: 'getByLabel',
          };
        }
        return null;

      case 'getByPlaceholder':
        if (info.placeholder) {
          return {
            locatorCode: `getByPlaceholder('${this.escapeString(info.placeholder)}')`,
            locatorType: 'getByPlaceholder',
          };
        }
        return null;

      case 'getByTestId':
        if (info.testId) {
          return {
            locatorCode: `getByTestId('${this.escapeString(info.testId)}')`,
            locatorType: 'getByTestId',
          };
        }
        return null;

      case 'getByText':
        if (info.text && info.text.length <= 50) {
          return {
            locatorCode: `getByText('${this.escapeString(info.text)}')`,
            locatorType: 'getByText',
          };
        }
        return null;

      case 'locator':
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
        return null;

      default:
        return null;
    }
  }

  private generateElementName(
    info: ElementInfo,
    elementType: ElementType
  ): string {
    let baseName = '';
    const maxLength = this.config.namingRules.maxTextLength;

    if (info.ariaLabel) {
      baseName = info.ariaLabel;
    } else if (info.label) {
      baseName = info.label;
    } else if (info.placeholder) {
      baseName = info.placeholder;
    } else if (info.text && info.text.length <= maxLength) {
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

    const processedName = this.config.namingRules.useCamelCase 
      ? this.toCamelCase(baseName) 
      : baseName;
    const suffix = this.config.namingRules.suffixes[elementType] || 'Element';

    return `${processedName}${suffix}`;
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

  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/\n/g, ' ').trim();
  }

  private generateTemplate(pageName: string, elements: AnalyzedPage): string {
    const className = this.toPascalCase(pageName) + 'Page';
    const allElements = this.flattenElements(elements);
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
`;

    if (this.config.templateOptions.includeGotoMethod) {
      template += `
  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }
`;
    }

    if (this.config.templateOptions.generateHelperMethods) {
      template += this.generateHelperMethods(uniqueElements);
    }

    template += `}
`;

    return template;
  }

  private generateHelperMethods(elements: AnalyzedElement[]): string {
    let methods = '';

    const buttonElements = elements.filter((e) => e.elementType === 'button');
    for (const button of buttonElements) {
      const methodName = `click${this.toPascalCase(button.name.replace(/Button$/, ''))}`;
      methods += `
  async ${methodName}(): Promise<void> {
    await this.${button.name}.click();
  }
`;
    }

    const inputElements = elements.filter(
      (e) => e.elementType === 'input' || e.elementType === 'textarea'
    );
    for (const input of inputElements) {
      const methodName = `fill${this.toPascalCase(input.name.replace(/(Input|Textarea)$/, ''))}`;
      methods += `
  async ${methodName}(value: string): Promise<void> {
    await this.${input.name}.fill(value);
  }
`;
    }

    const selectElements = elements.filter((e) => e.elementType === 'select');
    for (const select of selectElements) {
      const methodName = `select${this.toPascalCase(select.name.replace(/Select$/, ''))}`;
      methods += `
  async ${methodName}(value: string): Promise<void> {
    await this.${select.name}.selectOption(value);
  }
`;
    }

    const checkboxElements = elements.filter((e) => e.elementType === 'checkbox');
    for (const checkbox of checkboxElements) {
      const baseName = this.toPascalCase(checkbox.name.replace(/Checkbox$/, ''));
      methods += `
  async check${baseName}(): Promise<void> {
    await this.${checkbox.name}.check();
  }

  async uncheck${baseName}(): Promise<void> {
    await this.${checkbox.name}.uncheck();
  }
`;
    }

    const linkElements = elements.filter((e) => e.elementType === 'link');
    for (const link of linkElements) {
      const methodName = `click${this.toPascalCase(link.name.replace(/Link$/, ''))}Link`;
      methods += `
  async ${methodName}(): Promise<void> {
    await this.${link.name}.click();
  }
`;
    }

    return methods;
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
