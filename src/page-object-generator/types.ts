export interface ElementInfo {
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

export type LocatorType = 'getByRole' | 'getByLabel' | 'getByText' | 'getByPlaceholder' | 'getByTestId' | 'locator';

export type ElementType = 'button' | 'input' | 'link' | 'select' | 'checkbox' | 'radio' | 'textarea' | 'heading' | 'other';

export interface AnalyzedElement {
  name: string;
  locatorCode: string;
  locatorType: LocatorType;
  elementType: ElementType;
  originalInfo: ElementInfo;
}

export interface AnalyzedPage {
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

export interface GeneratorConfig {
  locatorPriority: LocatorType[];
  namingRules: {
    maxTextLength: number;
    suffixes: Record<ElementType, string>;
    useCamelCase: boolean;
  };
  ignoreRules: {
    ignoreClasses: string[];
    ignoreIds: string[];
    ignoreRoles: string[];
  };
  templateOptions: {
    generateHelperMethods: boolean;
    includeGotoMethod: boolean;
  };
}

export interface GeneratorOptions {
  screenshot?: boolean;
  screenshotPath?: string;
  jsonOutput?: boolean;
  verbose?: boolean;
  config?: Partial<GeneratorConfig>;
}

export interface PageObjectMetadata {
  url: string;
  pageName: string;
  generatedAt: string;
  elementCount: number;
  elements: AnalyzedElement[];
  screenshotPath?: string;
  config?: GeneratorConfig;
}

export interface DiffResult {
  added: AnalyzedElement[];
  removed: AnalyzedElement[];
  modified: Array<{ old: AnalyzedElement; new: AnalyzedElement }>;
  unchanged: AnalyzedElement[];
}

export const DEFAULT_CONFIG: GeneratorConfig = {
  locatorPriority: ['getByRole', 'getByLabel', 'getByPlaceholder', 'getByTestId', 'getByText', 'locator'],
  namingRules: {
    maxTextLength: 30,
    suffixes: {
      button: 'Button',
      input: 'Input',
      link: 'Link',
      select: 'Select',
      checkbox: 'Checkbox',
      radio: 'Radio',
      textarea: 'Textarea',
      heading: 'Heading',
      other: 'Element',
    },
    useCamelCase: true,
  },
  ignoreRules: {
    ignoreClasses: [],
    ignoreIds: [],
    ignoreRoles: [],
  },
  templateOptions: {
    generateHelperMethods: true,
    includeGotoMethod: true,
  },
};
