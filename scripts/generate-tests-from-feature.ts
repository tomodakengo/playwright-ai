#!/usr/bin/env ts-node
/**
 * Generate Tests from Feature
 * CLI tool for generating Playwright tests from Gherkin feature files
 * Supports both direct Playwright execution and Playwright MCP integration
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import {
  parseAndExpandFeatureFile,
  interpretScenario,
  interpretScenarioWithAI,
  ScenarioExecutor,
  generateTestFile,
  writeGeneratedTest,
  createOpenAIInterpreter,
  ScenarioRunnerConfig,
  DEFAULT_CONFIG,
  hasUnknownActions,
  getUnknownActions,
  MCPScenarioExecutor,
} from '../src/scenario-runner';

interface CLIOptions {
  featurePath: string;
  baseUrl: string;
  outputDir: string;
  execute: boolean;
  useAI: boolean;
  useMCP: boolean;
  mcpServerUrl: string;
  verbose: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`
Generate Tests from Feature - Generate Playwright tests from Gherkin feature files

Usage:
  npx ts-node scripts/generate-tests-from-feature.ts [options] <feature-file>

Options:
  -u, --base-url <url>     Base URL for the test site (required)
  -o, --output <dir>       Output directory for generated files (default: ./generated)
  -e, --execute            Execute the scenario against the live site
  --ai                     Use OpenAI for interpreting unknown steps
  --mcp                    Use Playwright MCP for browser automation (requires MCP server)
  --mcp-url <url>          Playwright MCP server URL (default: http://localhost:8931)
  -v, --verbose            Enable verbose output
  -h, --help               Show this help message

Environment Variables:
  OPENAI_API_KEY           OpenAI API key (required for --ai flag)

Playwright MCP Integration:
  The --mcp flag enables browser automation via Playwright MCP server.
  This provides accessibility tree-based element selection, which is more
  robust and LLM-friendly than traditional DOM-based approaches.

  To start a Playwright MCP server:
    npx @playwright/mcp@latest --port 8931

  MCP features:
  - Accessibility tree snapshots for intelligent element selection
  - AI-enhanced element finding (when combined with --ai)
  - Deterministic browser automation
  - Support for device emulation and multi-tab scenarios

Examples:
  # Generate tests from a feature file
  npx ts-node scripts/generate-tests-from-feature.ts -u https://example.com ./features/signup.feature

  # Generate and execute tests
  npx ts-node scripts/generate-tests-from-feature.ts -e -u https://example.com ./features/signup.feature

  # Use AI for unknown steps
  npx ts-node scripts/generate-tests-from-feature.ts --ai -u https://example.com ./features/signup.feature

  # Execute with Playwright MCP (start MCP server first)
  npx ts-node scripts/generate-tests-from-feature.ts -e --mcp -u https://example.com ./features/signup.feature

  # Execute with MCP and AI-enhanced element finding
  npx ts-node scripts/generate-tests-from-feature.ts -e --mcp --ai -u https://example.com ./features/signup.feature

Exit Codes:
  0 - Success
  1 - Error (invalid arguments, file not found, etc.)
  2 - Execution failed (when using -e flag)
`);
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    featurePath: '',
    baseUrl: '',
    outputDir: './generated',
    execute: false,
    useAI: false,
    useMCP: false,
    mcpServerUrl: 'http://localhost:8931',
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-u':
      case '--base-url':
        if (i + 1 >= args.length) {
          throw new Error('Missing value for --base-url');
        }
        options.baseUrl = args[++i];
        break;
      case '-o':
      case '--output':
        if (i + 1 >= args.length) {
          throw new Error('Missing value for --output');
        }
        options.outputDir = args[++i];
        break;
      case '-e':
      case '--execute':
        options.execute = true;
        break;
      case '--ai':
        options.useAI = true;
        break;
      case '--mcp':
        options.useMCP = true;
        break;
      case '--mcp-url':
        if (i + 1 >= args.length) {
          throw new Error('Missing value for --mcp-url');
        }
        options.mcpServerUrl = args[++i];
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (!options.featurePath) {
          options.featurePath = arg;
        }
        break;
    }
  }

  return options;
}

function validateOptions(options: CLIOptions): void {
  if (options.help) {
    return;
  }

  if (!options.featurePath) {
    throw new Error('Feature file path is required');
  }

  if (!options.baseUrl) {
    throw new Error('Base URL is required (use -u or --base-url)');
  }

  if (options.useAI && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required when using --ai flag');
  }

  if (options.useMCP && !options.execute) {
    console.warn('Warning: --mcp flag has no effect without -e/--execute flag');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  let options: CLIOptions;
  try {
    options = parseArgs(args);
    validateOptions(options);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    printHelp();
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const { featurePath, baseUrl, outputDir, execute, useAI, useMCP, mcpServerUrl, verbose } = options;

  // Check if feature file exists
  try {
    await fs.access(featurePath);
  } catch {
    console.error(`Error: Feature file not found: ${featurePath}`);
    process.exit(1);
  }

  console.log(`\nProcessing feature file: ${featurePath}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Output directory: ${outputDir}`);
  if (useAI) {
    console.log('AI interpretation: enabled');
  }
  if (execute) {
    console.log('Execution mode: enabled');
    if (useMCP) {
      console.log(`MCP mode: enabled (server: ${mcpServerUrl})`);
    }
  }
  console.log('');

  // Parse and expand feature file
  console.log('Parsing feature file...');
  const concreteScenarios = await parseAndExpandFeatureFile(featurePath);
  console.log(`Found ${concreteScenarios.length} scenario(s) to process\n`);

  // Create configuration
  const config: ScenarioRunnerConfig = {
    ...DEFAULT_CONFIG,
    baseUrl,
    outputDir,
  };

  // Create AI interpreter if requested
  const aiInterpreter = useAI ? createOpenAIInterpreter() : null;

  // Process each scenario
  let hasErrors = false;
  
  for (const scenario of concreteScenarios) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${scenario.name}`);
    console.log('='.repeat(60));

    // Interpret scenario
    console.log('\nInterpreting steps...');
    const plannedScenario = aiInterpreter
      ? await interpretScenarioWithAI(scenario, aiInterpreter)
      : interpretScenario(scenario);

    // Check for unknown actions
    if (hasUnknownActions(plannedScenario)) {
      const unknownActions = getUnknownActions(plannedScenario);
      console.warn(`\nWarning: ${unknownActions.length} step(s) could not be interpreted:`);
      for (const action of unknownActions) {
        console.warn(`  - ${action.rawStepText}`);
      }
      if (!useAI) {
        console.warn('\nTip: Use --ai flag to enable AI interpretation for unknown steps');
      }
    }

    if (verbose) {
      console.log('\nPlanned actions:');
      for (const action of plannedScenario.actions) {
        console.log(`  [${action.type}] ${action.rawStepText}`);
        if (Object.keys(action.params).length > 0) {
          console.log(`    params: ${JSON.stringify(action.params)}`);
        }
      }
    }

    // Execute scenario if requested
    let executionTrace;
    if (execute) {
      if (useMCP) {
        // Use MCP-based execution
        console.log('\nExecuting scenario via Playwright MCP...');
        const mcpExecutor = new MCPScenarioExecutor({
          ...config,
          mcpServerUrl,
        });
        
        try {
          executionTrace = await mcpExecutor.execute(plannedScenario);
          
          if (executionTrace.success) {
            console.log('MCP execution completed successfully!');
          } else {
            console.error(`MCP execution failed: ${executionTrace.error}`);
            hasErrors = true;
          }

          if (verbose && executionTrace.steps.length > 0) {
            console.log('\nExecution trace (MCP):');
            for (const step of executionTrace.steps) {
              const status = step.success ? 'OK' : 'FAILED';
              console.log(`  [${status}] ${step.action.rawStepText}`);
              if (!step.success && step.error) {
                console.log(`    Error: ${step.error}`);
              }
            }
          }
        } finally {
          await mcpExecutor.close();
        }
      } else {
        // Use direct Playwright execution
        console.log('\nExecuting scenario against live site...');
        const executor = new ScenarioExecutor(config);
        
        try {
          await executor.initialize();
          executionTrace = await executor.executeScenario(plannedScenario);
          
          if (executionTrace.success) {
            console.log('Execution completed successfully!');
          } else {
            console.error(`Execution failed: ${executionTrace.error}`);
            hasErrors = true;
          }

          if (verbose && executionTrace.steps.length > 0) {
            console.log('\nExecution trace:');
            for (const step of executionTrace.steps) {
              const status = step.success ? 'OK' : 'FAILED';
              console.log(`  [${status}] ${step.action.rawStepText}`);
              if (!step.success && step.error) {
                console.log(`    Error: ${step.error}`);
              }
            }
          }
        } finally {
          await executor.close();
        }
      }
    }

    // Generate test file
    console.log('\nGenerating test files...');
    const generatedTest = generateTestFile(plannedScenario, config, executionTrace);
    await writeGeneratedTest(generatedTest, outputDir);

    console.log(`\nGenerated files for: ${scenario.name}`);
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Processed ${concreteScenarios.length} scenario(s)`);
  console.log(`Output directory: ${path.resolve(outputDir)}`);
  
  if (hasErrors) {
    console.log('\nSome scenarios failed during execution.');
    process.exit(2);
  } else {
    console.log('\nAll scenarios processed successfully!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
