import { AnalyzedElement, DiffResult, PageObjectMetadata } from './types';

export class PageObjectDiff {
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

  static toRefactorPlan(diff: DiffResult, pageName: string): RefactorPlan {
    const actions: RefactorAction[] = [];

    for (const el of diff.added) {
      actions.push({
        type: 'add',
        elementName: el.name,
        locatorCode: el.locatorCode,
        elementType: el.elementType,
      });
    }

    for (const el of diff.removed) {
      actions.push({
        type: 'remove',
        elementName: el.name,
        locatorCode: el.locatorCode,
        elementType: el.elementType,
      });
    }

    for (const { old, new: newEl } of diff.modified) {
      actions.push({
        type: 'modify',
        elementName: old.name,
        oldLocatorCode: old.locatorCode,
        newLocatorCode: newEl.locatorCode,
        elementType: newEl.elementType,
      });
    }

    return {
      pageName,
      generatedAt: new Date().toISOString(),
      summary: {
        added: diff.added.length,
        removed: diff.removed.length,
        modified: diff.modified.length,
        unchanged: diff.unchanged.length,
      },
      actions,
    };
  }
}

export interface RefactorAction {
  type: 'add' | 'remove' | 'modify';
  elementName: string;
  locatorCode?: string;
  oldLocatorCode?: string;
  newLocatorCode?: string;
  elementType: string;
}

export interface RefactorPlan {
  pageName: string;
  generatedAt: string;
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  actions: RefactorAction[];
}
