# Playwright AI

Gherkin（日本語）で記述されたテストシナリオをPlaywrightテストに変換し、Page Objectの自動生成やAI支援機能を提供するテスト自動化フレームワークです。

## 目次

- [機能概要](#機能概要)
- [インストール](#インストール)
- [クイックスタート](#クイックスタート)
- [Page Object Generator](#page-object-generator)
- [Scenario Runner](#scenario-runner)
- [CI/CD連携](#cicd連携)
- [設定オプション](#設定オプション)
- [トラブルシューティング](#トラブルシューティング)

## 機能概要

このプロジェクトは主に2つの機能を提供します：

### 1. Page Object Generator
WebページのDOM解析を行い、Playwright用のPage Objectクラスを自動生成します。
- ロール・ラベル・テキストベースの堅牢なロケーター生成
- スクリーンショット取得機能
- 変更検知（Diff）機能によるUI変更の追跡
- CI/CD統合のためのJSON出力

### 2. Scenario Runner
Gherkin形式（日本語対応）で記述されたテストシナリオをPlaywrightテストに変換・実行します。
- 日本語ステップの解釈と実行
- OpenAI連携による不明なステップの自動解釈
- Playwright MCP（Model Context Protocol）対応
- テストコードの自動生成

## インストール

```bash
# リポジトリのクローン
git clone https://github.com/tomodakengo/playwright-ai.git
cd playwright-ai

# 依存関係のインストール
npm install

# Playwrightブラウザのインストール
npx playwright install chromium
```

## クイックスタート

### Page Objectの生成

```bash
# 基本的な生成
npm run po:generate -- https://example.com Login

# ファイルに保存
npm run po:generate -- https://example.com Login ./pages/LoginPage.ts

# スクリーンショット付き
npm run po:generate -- -s https://example.com Login
```

### Gherkinシナリオからテスト生成

```bash
# featureファイルからテスト生成
npm run scenario:generate -- -u https://example.com ./features/signup.feature

# 生成と同時に実行
npm run scenario:generate -- -e -u https://example.com ./features/signup.feature
```

## Page Object Generator

### 概要

WebページをPlaywrightで解析し、TypeScriptのPage Objectクラスを自動生成します。ロケーターの優先順位は以下の通りです：

1. `getByRole` - アクセシブルロール + 名前
2. `getByLabel` - ラベルテキスト
3. `getByPlaceholder` - プレースホルダーテキスト
4. `getByTestId` - data-testid属性
5. `getByText` - テキストコンテンツ
6. `locator` - CSS/属性セレクター

### CLIコマンド

| コマンド | 説明 |
|---------|------|
| `npm run po:generate` | Page Objectを生成 |
| `npm run po:record` | ベースラインメタデータを記録 |
| `npm run po:check` | 保存されたメタデータと比較して変更を検出 |

### オプション

| オプション | 短縮形 | 説明 |
|-----------|--------|------|
| `--screenshot` | `-s` | ページのスクリーンショットを取得 |
| `--screenshot-path <path>` | | スクリーンショットの保存先 |
| `--json` | `-j` | メタデータをJSON形式で出力 |
| `--verbose` | `-v` | 詳細出力を有効化 |
| `--metadata <path>` | `-m` | メタデータをJSONファイルに保存 |
| `--compare <path>` | `-c` | 既存のメタデータファイルと比較 |

### 使用例

```bash
# 基本生成（標準出力）
npm run po:generate -- https://hotel.testplanisphere.dev/ja/ Login

# ファイルに保存
npm run po:generate -- https://hotel.testplanisphere.dev/ja/ Login ./pages/LoginPage.ts

# スクリーンショット付きで生成
npm run po:generate -- -s https://hotel.testplanisphere.dev/ja/ Login ./pages/LoginPage.ts

# JSONメタデータとして保存
npm run po:generate -- -j -m ./metadata/login.json https://hotel.testplanisphere.dev/ja/ Login

# 変更検出（CI用）
npm run po:check -- ./metadata/login.json https://hotel.testplanisphere.dev/ja/ Login
```

### 生成されるコードの例

```typescript
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('メールアドレス');
    this.passwordInput = page.getByLabel('パスワード');
    this.loginButton = page.getByRole('button', { name: 'ログイン' });
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async clickLogin(): Promise<void> {
    await this.loginButton.click();
  }

  async fillEmail(value: string): Promise<void> {
    await this.emailInput.fill(value);
  }

  async fillPassword(value: string): Promise<void> {
    await this.passwordInput.fill(value);
  }
}
```

## Scenario Runner

### 概要

Gherkin形式で記述されたテストシナリオをPlaywrightテストコードに変換・実行します。日本語のステップをサポートしています。

### Gherkinファイルの例

```gherkin
Feature: 会員登録を行い、マイページの表示内容を確認する

  Scenario Outline: Signup
    Given HOTELPLANISPHEREのホームページにアクセスする
    When 会員登録リンクを押下する
    And ページの見出しが「会員登録」であることを確認する
    And 会員登録画面で「<signup_input>」を入力する
    And 登録ボタンを押下する
    Then ページの見出しが「マイページ」であることを確認する

    Examples:
    | signup_input |
    | {"会員情報_入力":{"name": "テスト太郎", "email": "test@example.com"}} |
```

### CLIコマンド

```bash
npm run scenario:generate -- [options] <feature-file>
```

### オプション

| オプション | 短縮形 | 説明 |
|-----------|--------|------|
| `--base-url <url>` | `-u` | テストサイトのベースURL（必須） |
| `--output <dir>` | `-o` | 生成ファイルの出力先（デフォルト: ./generated） |
| `--execute` | `-e` | シナリオを実際に実行 |
| `--ai` | | OpenAIで不明なステップを解釈 |
| `--mcp` | | Playwright MCPでブラウザ操作 |
| `--mcp-url <url>` | | MCPサーバーURL（デフォルト: http://localhost:8931） |
| `--verbose` | `-v` | 詳細出力を有効化 |

### 使用例

```bash
# featureファイルからテスト生成
npm run scenario:generate -- -u https://hotel.testplanisphere.dev ./features/signup.feature

# 生成と同時に実行
npm run scenario:generate -- -e -u https://hotel.testplanisphere.dev ./features/signup.feature

# AI解釈を使用（OPENAI_API_KEY環境変数が必要）
npm run scenario:generate -- --ai -u https://hotel.testplanisphere.dev ./features/signup.feature

# Playwright MCPで実行
npm run scenario:generate -- -e --mcp -u https://hotel.testplanisphere.dev ./features/signup.feature
```

### AI連携機能

OpenAI APIを使用して、定義されていないステップを自動的に解釈できます：

```bash
# 環境変数を設定
export OPENAI_API_KEY=your-api-key

# AI解釈を有効化
npm run scenario:generate -- --ai -u https://example.com ./features/test.feature
```

### Playwright MCP連携

Playwright MCP（Model Context Protocol）サーバーと連携することで、アクセシビリティツリーベースの要素選択が可能になります：

```bash
# MCPサーバーを起動
npx @playwright/mcp@latest --port 8931

# 別ターミナルでMCPモードで実行
npm run scenario:generate -- -e --mcp -u https://example.com ./features/test.feature
```

## CI/CD連携

### ベースラインの記録

```bash
npm run po:record -- ./metadata/login.json https://your-app.com/login Login
```

### 変更検出

```bash
npm run po:check -- ./metadata/login.json https://your-app.com/login Login
```

### 終了コード

| コード | 説明 |
|--------|------|
| 0 | 成功（変更なし） |
| 1 | エラー（引数不正、ネットワークエラーなど） |
| 2 | 変更検出（CIでビルド失敗として扱える） |

### GitHub Actions例

```yaml
name: Page Object Check

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check-page-objects:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Install Playwright browsers
        run: npx playwright install chromium
        
      - name: Check Page Objects for changes
        run: npm run po:check -- ./metadata/login.json https://your-app.com Login
```

## 設定オプション

### Page Object Generator設定

```typescript
interface GeneratorConfig {
  locatorPriority: LocatorType[];  // ロケーター優先順位
  namingRules: {
    maxTextLength: number;         // テキスト最大長
    suffixes: Record<ElementType, string>;  // 要素タイプ別サフィックス
    useCamelCase: boolean;
  };
  ignoreRules: {
    ignoreClasses: string[];       // 無視するCSSクラス
    ignoreIds: string[];           // 無視するID
    ignoreRoles: string[];         // 無視するロール
  };
  templateOptions: {
    generateHelperMethods: boolean;  // ヘルパーメソッド生成
    includeGotoMethod: boolean;
  };
}
```

### Scenario Runner設定

```typescript
interface ScenarioRunnerConfig {
  baseUrl: string;                 // ベースURL
  pages?: Record<string, string>;  // ページ名とパスのマッピング
  headless?: boolean;              // ヘッドレスモード
  timeout?: number;                // タイムアウト（ミリ秒）
  screenshotOnError?: boolean;     // エラー時スクリーンショット
  outputDir?: string;              // 出力ディレクトリ
  openai?: {
    apiKey: string;
    model?: string;
  };
}
```

## トラブルシューティング

### ブラウザが起動しない

Playwrightブラウザがインストールされているか確認してください：

```bash
npx playwright install chromium
```

### 要素が検出されない

- 詳細モード（`-v`）で実行して検出状況を確認
- 対象要素に`aria-label`や`data-testid`属性を追加することを検討

```bash
npm run po:generate -- -v https://example.com Login
```

### タイムアウトエラー

- ネットワーク接続を確認
- URLが正しくアクセス可能か確認
- タイムアウト設定を調整

### OpenAI APIエラー

- `OPENAI_API_KEY`環境変数が正しく設定されているか確認
- APIキーの有効性を確認

### MCP接続エラー

MCPサーバーが起動しているか確認：

```bash
# MCPサーバーを起動
npx @playwright/mcp@latest --port 8931
```

## 開発者向け情報

### 開発サーバーの起動

このプロジェクトはNext.jsベースのWebインターフェースも含んでいます：

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) でアクセスできます。

### ビルド

```bash
npm run build
```

### リント

```bash
npm run lint
```

## ライセンス

MIT License

## 貢献

Issue報告やPull Requestを歓迎します！
