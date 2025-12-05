/**
 * Scenario Runner Types
 * Types for Gherkin-based test automation
 */

// Gherkin Step Types
export type StepKind = 'given' | 'when' | 'then' | 'and' | 'but';

export interface Step {
  kind: StepKind;
  text: string;
  line: number;
}

export interface Scenario {
  name: string;
  steps: Step[];
  examples?: ExampleTable;
  tags?: string[];
}

export interface ExampleTable {
  headers: string[];
  rows: Record<string, string>[];
}

export interface Feature {
  name: string;
  description?: string;
  scenarios: Scenario[];
  tags?: string[];
}

// Concrete scenario after expanding Examples
export interface ConcreteScenario {
  name: string;
  steps: Step[];
  params: Record<string, string>;
  rowIndex: number;
}

// Action Types for the interpreter
export type ActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'fillForm'
  | 'select'
  | 'check'
  | 'assertHeading'
  | 'assertText'
  | 'assertUrl'
  | 'assertFields'
  | 'logout'
  | 'unknown';

export interface Action {
  type: ActionType;
  rawStepText: string;
  params: Record<string, unknown>;
}

export interface PlannedScenario {
  name: string;
  actions: Action[];
  data: ScenarioData;
}

// Domain-specific data types for the hotel signup scenario
export interface SignupFormData {
  '会員情報_入力': {
    name: string;
    email: string;
    password: string;
    password_confirm: string;
    rank: string;
    address: string;
    phone: string;
    gender: string;
    birthday: string;
    check_flag: string;
  };
}

export interface MypageExpectedData {
  'マイページ情報_検証': {
    name: string;
    email: string;
    rank: string;
    address: string;
    phone: string;
    gender: string;
    birthday: string;
    check_flag: string;
  };
}

export interface ScenarioData {
  signupInput?: SignupFormData;
  mypageValidate?: MypageExpectedData;
  raw: Record<string, string>;
}

// Configuration for the scenario runner
export interface ScenarioRunnerConfig {
  baseUrl: string;
  pages?: Record<string, string>;
  headless?: boolean;
  timeout?: number;
  screenshotOnError?: boolean;
  outputDir?: string;
  openai?: {
    apiKey: string;
    model?: string;
  };
}

// Field mapping configuration
export interface FieldMapping {
  jsonKey: string;
  locatorType: 'label' | 'name' | 'role' | 'testid' | 'placeholder';
  locatorValue: string;
  inputType?: 'text' | 'select' | 'radio' | 'checkbox' | 'date';
  options?: Record<string, string>; // For select/radio mapping
}

export interface FormConfig {
  signup: FieldMapping[];
  mypage: FieldMapping[];
}

// Default field mappings for the hotel site
export const HOTEL_SIGNUP_FIELD_MAPPINGS: FieldMapping[] = [
  { jsonKey: 'email', locatorType: 'name', locatorValue: 'email', inputType: 'text' },
  { jsonKey: 'password', locatorType: 'name', locatorValue: 'password', inputType: 'text' },
  { jsonKey: 'password_confirm', locatorType: 'name', locatorValue: 'password-confirmation', inputType: 'text' },
  { jsonKey: 'name', locatorType: 'name', locatorValue: 'username', inputType: 'text' },
  { 
    jsonKey: 'rank', 
    locatorType: 'name', 
    locatorValue: 'rank', 
    inputType: 'radio',
    options: {
      'プレミアム会員': 'premium',
      '一般会員': 'normal',
    }
  },
  { jsonKey: 'address', locatorType: 'name', locatorValue: 'address', inputType: 'text' },
  { jsonKey: 'phone', locatorType: 'name', locatorValue: 'tel', inputType: 'text' },
  { 
    jsonKey: 'gender', 
    locatorType: 'name', 
    locatorValue: 'gender', 
    inputType: 'select',
    options: {
      '回答しない': '0',
      '男性': '1',
      '女性': '2',
      'その他': '9',
    }
  },
  { jsonKey: 'birthday', locatorType: 'name', locatorValue: 'birthday', inputType: 'date' },
  { 
    jsonKey: 'check_flag', 
    locatorType: 'name', 
    locatorValue: 'notification', 
    inputType: 'checkbox',
    options: {
      '受け取る': 'checked',
      '受け取らない': 'unchecked',
    }
  },
];

export const HOTEL_MYPAGE_FIELD_MAPPINGS: FieldMapping[] = [
  { jsonKey: 'email', locatorType: 'label', locatorValue: 'メールアドレス', inputType: 'text' },
  { jsonKey: 'name', locatorType: 'label', locatorValue: '氏名', inputType: 'text' },
  { jsonKey: 'rank', locatorType: 'label', locatorValue: '会員ランク', inputType: 'text' },
  { jsonKey: 'address', locatorType: 'label', locatorValue: '住所', inputType: 'text' },
  { jsonKey: 'phone', locatorType: 'label', locatorValue: '電話番号', inputType: 'text' },
  { jsonKey: 'gender', locatorType: 'label', locatorValue: '性別', inputType: 'text' },
  { jsonKey: 'birthday', locatorType: 'label', locatorValue: '生年月日', inputType: 'text' },
  { jsonKey: 'check_flag', locatorType: 'label', locatorValue: 'お知らせ', inputType: 'text' },
];

// Execution trace for recording what happened
export interface ExecutionTrace {
  scenarioName: string;
  startTime: Date;
  endTime?: Date;
  steps: ExecutionStep[];
  success: boolean;
  error?: string;
  screenshots: string[];
}

export interface ExecutionStep {
  action: Action;
  startTime: Date;
  endTime: Date;
  success: boolean;
  error?: string;
  screenshot?: string;
  pageUrl?: string;
}

// Test generation output
export interface GeneratedTest {
  filename: string;
  content: string;
  pageObjects: GeneratedPageObject[];
}

export interface GeneratedPageObject {
  filename: string;
  className: string;
  content: string;
}

// Default configuration
export const DEFAULT_CONFIG: Partial<ScenarioRunnerConfig> = {
  headless: true,
  timeout: 30000,
  screenshotOnError: true,
  outputDir: './generated',
  pages: {
    'HOTELPLANISPHEREのホームページ': '/ja/',
    'ホームページ': '/ja/',
    '会員登録': '/ja/signup.html',
    'ログイン': '/ja/login.html',
    'マイページ': '/ja/mypage.html',
  },
};
