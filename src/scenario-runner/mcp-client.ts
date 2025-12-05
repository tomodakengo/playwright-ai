/**
 * Playwright MCP Client
 * Client for communicating with Playwright MCP server via HTTP/SSE transport
 */

// EventSource import removed - not needed for current HTTP-based implementation

export interface MCPConfig {
  serverUrl: string;
  timeout?: number;
}

export interface MCPToolResult {
  success: boolean;
  content?: string;
  error?: string;
  screenshot?: string;
}

export interface AccessibilityNode {
  role: string;
  name?: string;
  ref?: string;
  children?: AccessibilityNode[];
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  level?: number;
  selected?: boolean;
}

export interface MCPSnapshot {
  url: string;
  title: string;
  accessibility: AccessibilityNode;
}

/**
 * MCP Client for Playwright MCP server
 * Communicates via HTTP transport with SSE for streaming
 */
export class PlaywrightMCPClient {
  private serverUrl: string;
  private timeout: number;
  private sessionId: string | null = null;

  constructor(config: MCPConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
  }

  /**
   * Initialize connection to MCP server
   */
  async connect(): Promise<void> {
    try {
      const response = await this.callTool('browser_snapshot', {});
      if (response.success) {
        console.log('Connected to Playwright MCP server');
      }
    } catch (error) {
      throw new Error(`Failed to connect to MCP server: ${error}`);
    }
  }

  /**
   * Call an MCP tool
   */
  private async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.serverUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.error) {
        return {
          success: false,
          error: result.error.message || JSON.stringify(result.error),
        };
      }

      return {
        success: true,
        content: result.result?.content?.[0]?.text || JSON.stringify(result.result),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: String(error) };
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<MCPToolResult> {
    return this.callTool('browser_navigate', { url });
  }

  /**
   * Click an element by ref (from accessibility tree)
   */
  async click(ref: string): Promise<MCPToolResult> {
    return this.callTool('browser_click', { element: ref });
  }

  /**
   * Fill a text input
   */
  async fill(ref: string, value: string): Promise<MCPToolResult> {
    return this.callTool('browser_type', { element: ref, text: value });
  }

  /**
   * Select an option from a dropdown
   */
  async select(ref: string, values: string[]): Promise<MCPToolResult> {
    return this.callTool('browser_select_option', { element: ref, values });
  }

  /**
   * Check or uncheck a checkbox
   */
  async check(ref: string, checked: boolean): Promise<MCPToolResult> {
    if (checked) {
      return this.callTool('browser_check', { element: ref });
    } else {
      return this.callTool('browser_uncheck', { element: ref });
    }
  }

  /**
   * Get the current page snapshot (accessibility tree)
   */
  async getSnapshot(): Promise<MCPSnapshot | null> {
    const result = await this.callTool('browser_snapshot', {});
    if (!result.success || !result.content) {
      return null;
    }
    
    try {
      // Parse the accessibility tree from the snapshot
      const content = result.content;
      // The snapshot format includes URL, title, and accessibility tree
      const urlMatch = content.match(/- Page URL: (.+)/);
      const titleMatch = content.match(/- Page Title: (.+)/);
      
      return {
        url: urlMatch?.[1] || '',
        title: titleMatch?.[1] || '',
        accessibility: this.parseAccessibilityTree(content),
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse accessibility tree from MCP snapshot text
   */
  private parseAccessibilityTree(content: string): AccessibilityNode {
    // The accessibility tree is returned as a text representation
    // We need to parse it into a structured format
    const lines = content.split('\n');
    const root: AccessibilityNode = { role: 'document', children: [] };
    
    // Simple parsing - in production, this would be more sophisticated
    for (const line of lines) {
      const match = line.match(/- (link|button|textbox|checkbox|radio|combobox|heading|text) "([^"]+)"(?: \[ref=(\d+)\])?/);
      if (match) {
        const [, role, name, ref] = match;
        root.children?.push({ role, name, ref });
      }
    }
    
    return root;
  }

  /**
   * Take a screenshot
   */
  async screenshot(): Promise<string | null> {
    const result = await this.callTool('browser_take_screenshot', {});
    if (!result.success) {
      return null;
    }
    return result.content || null;
  }

  /**
   * Press a key
   */
  async pressKey(key: string): Promise<MCPToolResult> {
    return this.callTool('browser_press_key', { key });
  }

  /**
   * Wait for page to be ready
   */
  async waitForLoadState(): Promise<MCPToolResult> {
    return this.callTool('browser_wait', { time: 1000 });
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    await this.callTool('browser_close', {});
  }

  /**
   * Find element by text in accessibility tree
   */
  findElementByText(snapshot: MCPSnapshot, text: string, role?: string): AccessibilityNode | null {
    const search = (node: AccessibilityNode): AccessibilityNode | null => {
      if (node.name?.includes(text)) {
        if (!role || node.role === role) {
          return node;
        }
      }
      if (node.children) {
        for (const child of node.children) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(snapshot.accessibility);
  }

  /**
   * Find element by role in accessibility tree
   */
  findElementByRole(snapshot: MCPSnapshot, role: string, name?: string): AccessibilityNode | null {
    const search = (node: AccessibilityNode): AccessibilityNode | null => {
      if (node.role === role) {
        if (!name || node.name?.includes(name)) {
          return node;
        }
      }
      if (node.children) {
        for (const child of node.children) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(snapshot.accessibility);
  }

  /**
   * Find all elements matching criteria
   */
  findAllElements(snapshot: MCPSnapshot, predicate: (node: AccessibilityNode) => boolean): AccessibilityNode[] {
    const results: AccessibilityNode[] = [];
    const search = (node: AccessibilityNode): void => {
      if (predicate(node)) {
        results.push(node);
      }
      if (node.children) {
        for (const child of node.children) {
          search(child);
        }
      }
    };
    search(snapshot.accessibility);
    return results;
  }
}

/**
 * Create a Playwright MCP client
 */
export function createMCPClient(serverUrl: string, timeout?: number): PlaywrightMCPClient {
  return new PlaywrightMCPClient({ serverUrl, timeout });
}

/**
 * Start Playwright MCP server as a child process
 */
export async function startMCPServer(options: {
  port?: number;
  headless?: boolean;
  browser?: 'chromium' | 'firefox' | 'webkit';
}): Promise<{ url: string; process: ReturnType<typeof import('child_process').spawn> }> {
  const { spawn } = await import('child_process');
  
  const port = options.port || 8931;
  const args = ['@playwright/mcp@latest', '--port', String(port)];
  
  if (options.headless) {
    args.push('--headless');
  }
  
  if (options.browser) {
    args.push('--browser', options.browser);
  }

  const serverProcess = spawn('npx', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('MCP server startup timeout'));
    }, 30000);

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (output.includes('Listening') || output.includes('ready')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`MCP server exited with code ${code}`));
      }
    });
  });

  return {
    url: `http://localhost:${port}`,
    process: serverProcess,
  };
}
