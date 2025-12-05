# Page Object Generator

A tool for automatically generating Playwright Page Objects from web pages using DOM analysis.

## Overview

The Page Object Generator analyzes web pages and automatically generates TypeScript Page Object classes following Playwright best practices. It uses a priority-based locator strategy to create robust, maintainable selectors.

## Features

- DOM analysis using Playwright's role-based locators
- Locator priority: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByTestId` > `getByText` > `locator`
- Auto-generation of helper methods (click, fill, select, check/uncheck)
- Screenshot capture functionality
- Page Object comparison/diff tool for detecting UI changes
- CI-friendly output formats (JSON, verbose mode)
- Metadata export for tracking changes over time
- Configurable locator priority and naming rules

## Installation

The generator is included in this project. No additional installation required.

## Quick Start

### Basic Generation

```bash
# Generate a Page Object from a URL
npm run po:generate -- https://example.com Login

# Save to a file
npm run po:generate -- https://example.com Login ./pages/LoginPage.ts
```

### With Screenshot

```bash
npm run po:generate -- -s https://example.com Login ./pages/LoginPage.ts
```

### JSON Metadata Output

```bash
npm run po:generate -- -j https://example.com Login
```

## CLI Reference

### Commands

| Command | Description |
|---------|-------------|
| `generate` | Generate a Page Object from a URL (default) |
| `compare` | Compare current page with saved metadata for changes |

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--screenshot` | `-s` | Capture a screenshot of the page |
| `--screenshot-path <path>` | | Path to save the screenshot |
| `--json` | `-j` | Output metadata as JSON |
| `--verbose` | `-v` | Enable verbose output |
| `--metadata <path>` | `-m` | Save metadata to a JSON file |
| `--compare <path>` | `-c` | Compare with existing metadata file |
| `--help` | `-h` | Show help documentation |

### Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success (no changes detected in compare mode) |
| 1 | Error (invalid arguments, network error, etc.) |
| 2 | Changes detected (in compare mode, for CI integration) |

## CI/CD Integration

### Recording Baseline Metadata

Record the current state of a page as baseline metadata:

```bash
npm run po:record -- ./metadata/login.json https://example.com Login
```

### Checking for Changes

Compare the current page against saved metadata:

```bash
npm run po:check -- ./metadata/login.json https://example.com Login
```

If changes are detected, the command exits with code 2, which can be used to fail CI builds.

### GitHub Actions Example

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

## Workflow Recommendations

### Initial Setup

1. Generate Page Objects for your application pages:
   ```bash
   npm run po:generate -- https://your-app.com/login Login ./pages/LoginPage.ts
   npm run po:generate -- https://your-app.com/dashboard Dashboard ./pages/DashboardPage.ts
   ```

2. Record baseline metadata for CI:
   ```bash
   npm run po:record -- ./metadata/login.json https://your-app.com/login Login
   npm run po:record -- ./metadata/dashboard.json https://your-app.com/dashboard Dashboard
   ```

3. Commit the generated Page Objects and metadata files.

### Ongoing Maintenance

1. Run CI checks on every PR to detect UI changes.
2. When changes are detected:
   - Review the diff output to understand what changed
   - Regenerate the Page Object if the changes are intentional
   - Update the baseline metadata

### Regenerating After UI Changes

```bash
# Regenerate the Page Object
npm run po:generate -- https://your-app.com/login Login ./pages/LoginPage.ts

# Update the baseline metadata
npm run po:record -- ./metadata/login.json https://your-app.com/login Login
```

## Programmatic API

The generator can also be used programmatically:

```typescript
import {
  PageObjectGenerator,
  PageObjectDiff,
  GeneratorOptions,
  PageObjectMetadata,
} from '../src/page-object-generator';

// Create generator with options
const options: GeneratorOptions = {
  screenshot: true,
  screenshotPath: './screenshots/login.png',
  verbose: true,
};

const generator = new PageObjectGenerator(options);

async function generatePageObject() {
  await generator.initialize();
  
  try {
    const { code, metadata } = await generator.generateFromUrl(
      'https://example.com',
      'Login'
    );
    
    console.log(code);
    console.log(JSON.stringify(metadata, null, 2));
  } finally {
    await generator.close();
  }
}

// Compare metadata
function compareMetadata(oldMetadata: PageObjectMetadata, newMetadata: PageObjectMetadata) {
  const diff = PageObjectDiff.compare(oldMetadata, newMetadata);
  
  if (PageObjectDiff.hasChanges(diff)) {
    console.log(PageObjectDiff.formatDiff(diff));
  }
}
```

## Configuration

The generator supports customizable configuration for locator priority, naming rules, and more.

### Configuration Options

```typescript
interface GeneratorConfig {
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
```

### Default Configuration

```typescript
const DEFAULT_CONFIG: GeneratorConfig = {
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
```

### Custom Configuration Example

```typescript
const customConfig: Partial<GeneratorConfig> = {
  locatorPriority: ['getByTestId', 'getByRole', 'getByLabel', 'locator'],
  ignoreRules: {
    ignoreClasses: ['hidden', 'sr-only'],
    ignoreIds: ['__next', '__nuxt'],
    ignoreRoles: [],
  },
};

const generator = new PageObjectGenerator({
  config: customConfig,
});
```

## Generated Code Example

For a login page, the generator might produce:

```typescript
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.loginButton = page.getByRole('button', { name: 'Log in' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
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

  async clickForgotPasswordLink(): Promise<void> {
    await this.forgotPasswordLink.click();
  }
}
```

## Troubleshooting

### Common Issues

**Browser not launching**
- Ensure Playwright browsers are installed: `npx playwright install chromium`

**Elements not detected**
- Some elements may not have accessible names or roles
- Try using verbose mode (`-v`) to see what elements are being detected
- Consider adding `aria-label` or `data-testid` attributes to your HTML

**Timeout errors**
- The page may take too long to load
- Check your network connection
- Ensure the URL is accessible

### Debug Mode

Use verbose mode to see detailed information about element detection:

```bash
npm run po:generate -- -v https://example.com Login
```

## Best Practices

1. **Use semantic HTML**: The generator works best with well-structured, accessible HTML
2. **Add accessible names**: Use `aria-label`, `<label>`, or visible text for interactive elements
3. **Use data-testid sparingly**: Only when other locators aren't suitable
4. **Review generated code**: Always review and test generated Page Objects
5. **Keep metadata in version control**: Track changes to your UI over time
6. **Run CI checks**: Detect unintended UI changes early
