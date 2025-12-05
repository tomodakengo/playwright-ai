/**
 * Gherkin Parser
 * Parses .feature files into structured scenario objects
 */

import * as Gherkin from '@cucumber/gherkin';
import * as Messages from '@cucumber/messages';
import {
  Feature,
  Scenario,
  Step,
  StepKind,
  ExampleTable,
  ConcreteScenario,
} from './types';

const uuidFn = Messages.IdGenerator.uuid();
const builder = new Gherkin.AstBuilder(uuidFn);
const matcher = new Gherkin.GherkinClassicTokenMatcher();
const parser = new Gherkin.Parser(builder, matcher);

/**
 * Parse a Gherkin feature file content into a Feature object
 */
export function parseFeature(content: string): Feature {
  const gherkinDocument = parser.parse(content);
  
  if (!gherkinDocument.feature) {
    throw new Error('No feature found in the Gherkin document');
  }

  const feature = gherkinDocument.feature;
  const scenarios: Scenario[] = [];

  for (const child of feature.children) {
    if (child.scenario) {
      const scenario = parseScenario(child.scenario);
      scenarios.push(scenario);
    }
  }

  return {
    name: feature.name,
    description: feature.description || undefined,
    scenarios,
    tags: feature.tags?.map(t => t.name) || [],
  };
}

/**
 * Parse a Gherkin scenario into a Scenario object
 */
function parseScenario(scenario: Messages.Scenario): Scenario {
  const steps: Step[] = scenario.steps.map(step => parseStep(step));
  
  let examples: ExampleTable | undefined;
  if (scenario.examples && scenario.examples.length > 0) {
    examples = parseExamples(scenario.examples[0]);
  }

  return {
    name: scenario.name,
    steps,
    examples,
    tags: scenario.tags?.map(t => t.name) || [],
  };
}

/**
 * Parse a Gherkin step into a Step object
 */
function parseStep(step: Messages.Step): Step {
  const keyword = step.keyword.trim().toLowerCase();
  let kind: StepKind;

  switch (keyword) {
    case 'given':
      kind = 'given';
      break;
    case 'when':
      kind = 'when';
      break;
    case 'then':
      kind = 'then';
      break;
    case 'and':
      kind = 'and';
      break;
    case 'but':
      kind = 'but';
      break;
    default:
      kind = 'and';
  }

  return {
    kind,
    text: step.text,
    line: step.location.line,
  };
}

/**
 * Parse Gherkin examples table
 */
function parseExamples(examples: Messages.Examples): ExampleTable {
  const headers = examples.tableHeader?.cells.map(cell => cell.value) || [];
  const rows: Record<string, string>[] = [];

  if (examples.tableBody) {
    for (const row of examples.tableBody) {
      const rowData: Record<string, string> = {};
      row.cells.forEach((cell, index) => {
        if (headers[index]) {
          rowData[headers[index]] = cell.value;
        }
      });
      rows.push(rowData);
    }
  }

  return { headers, rows };
}

/**
 * Expand a scenario with examples into concrete scenarios
 */
export function expandScenario(scenario: Scenario): ConcreteScenario[] {
  if (!scenario.examples || scenario.examples.rows.length === 0) {
    return [{
      name: scenario.name,
      steps: scenario.steps,
      params: {},
      rowIndex: 0,
    }];
  }

  return scenario.examples.rows.map((row, index) => {
    const expandedSteps = scenario.steps.map(step => ({
      ...step,
      text: substituteParams(step.text, row),
    }));

    return {
      name: `${scenario.name} [Example ${index + 1}]`,
      steps: expandedSteps,
      params: row,
      rowIndex: index,
    };
  });
}

/**
 * Substitute <param> placeholders in step text with actual values
 */
function substituteParams(text: string, params: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`<${key}>`, 'g'), value);
  }
  return result;
}

/**
 * Parse all scenarios from a feature and expand them
 */
export function parseAndExpandFeature(content: string): ConcreteScenario[] {
  const feature = parseFeature(content);
  const concreteScenarios: ConcreteScenario[] = [];

  for (const scenario of feature.scenarios) {
    const expanded = expandScenario(scenario);
    concreteScenarios.push(...expanded);
  }

  return concreteScenarios;
}

/**
 * Read and parse a feature file
 */
export async function parseFeatureFile(filePath: string): Promise<Feature> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return parseFeature(content);
}

/**
 * Read, parse, and expand a feature file
 */
export async function parseAndExpandFeatureFile(filePath: string): Promise<ConcreteScenario[]> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return parseAndExpandFeature(content);
}
