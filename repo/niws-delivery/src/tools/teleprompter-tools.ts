import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, unlinkSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { teleprompterFormatter } from '../services/teleprompterFormatter.js';
import { airDropService } from '../services/airdrop.js';
import { productionClient } from '../services/clients.js';
import { exportToRTF, exportToRTFWithTheme } from '../exporters/rtf.js';
import { exportToHTML, exportToHTMLDarkMode } from '../exporters/html.js';
import { exportToPlainText } from '../exporters/plainText.js';
import type { Script, ExportResult, FormatOptions } from '../types.js';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function success(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

function error(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true
  };
}

// Export directory
const EXPORT_DIR = process.env.EXPORT_DIR || join(process.cwd(), 'data', 'exports');

// Ensure export directory exists
function ensureExportDir(): void {
  if (!existsSync(EXPORT_DIR)) {
    mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

// Track exports
const exports: Map<string, ExportResult> = new Map();

// Tool: export_teleprompter
export async function exportTeleprompter(args: {
  scriptId: string;
  format: 'rtf' | 'html' | 'txt';
  theme?: 'light' | 'dark' | 'sepia';
  options?: Partial<FormatOptions>;
}): Promise<ToolResult> {
  try {
    ensureExportDir();

    // Fetch script from production server
    const script = await productionClient.getScript(args.scriptId);

    // Format for teleprompter
    const formatted = teleprompterFormatter.format(script);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = args.format;
    const filename = `teleprompter_${script.id}_${timestamp}.${extension}`;
    const filePath = join(EXPORT_DIR, filename);

    // Export based on format
    let content: string;
    switch (args.format) {
      case 'rtf':
        content = exportToRTFWithTheme(formatted, args.theme || 'light');
        break;
      case 'html':
        content = args.theme === 'dark'
          ? exportToHTMLDarkMode(formatted, script.title, { autoScroll: true })
          : exportToHTML(formatted, script.title, { autoScroll: true });
        break;
      case 'txt':
      default:
        content = exportToPlainText(formatted, script.title, { uppercase: true });
        break;
    }

    // Write file
    writeFileSync(filePath, content, 'utf-8');

    // Track export
    const exportResult: ExportResult = {
      id: uuidv4(),
      scriptId: args.scriptId,
      format: args.format,
      filePath,
      createdAt: new Date().toISOString()
    };
    exports.set(exportResult.id, exportResult);

    return success({
      status: 'exported',
      exportId: exportResult.id,
      format: args.format,
      filePath,
      theme: args.theme || 'light',
      wordCount: formatted.split(/\s+/).length
    });
  } catch (err) {
    return error(`Failed to export teleprompter: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: airdrop_to_ipad
export async function airdropToIpad(args: {
  filePath: string;
  device?: string;
}): Promise<ToolResult> {
  try {
    // Check availability
    const availability = await airDropService.checkAvailability();
    if (!availability.available) {
      return error(`AirDrop not available: ${availability.reason}`);
    }

    // Verify file exists
    if (!existsSync(args.filePath)) {
      return error(`File not found: ${args.filePath}`);
    }

    // Send via AirDrop
    const result = await airDropService.sendToDevice(args.filePath, args.device || 'iPad');

    if (result.success) {
      return success({
        status: 'sent',
        device: result.device,
        filePath: args.filePath
      });
    } else {
      return error(result.error || 'AirDrop failed');
    }
  } catch (err) {
    return error(`AirDrop failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: batch_export_and_transfer
export async function batchExportAndTransfer(args: {
  scriptIds: string[];
  format: 'rtf' | 'html' | 'txt';
  airdropDevice?: string;
}): Promise<ToolResult> {
  try {
    ensureExportDir();

    const results: Array<{ scriptId: string; status: string; filePath?: string; error?: string }> = [];

    for (const scriptId of args.scriptIds) {
      try {
        // Export
        const exportResult = await exportTeleprompter({
          scriptId,
          format: args.format
        });

        if (exportResult.isError) {
          results.push({
            scriptId,
            status: 'export_failed',
            error: exportResult.content[0].text
          });
          continue;
        }

        const exportData = JSON.parse(exportResult.content[0].text);
        const filePath = exportData.filePath;

        // AirDrop if device specified
        if (args.airdropDevice) {
          const airdropResult = await airDropService.sendToDevice(filePath, args.airdropDevice);
          results.push({
            scriptId,
            status: airdropResult.success ? 'transferred' : 'airdrop_failed',
            filePath,
            error: airdropResult.error
          });
        } else {
          results.push({
            scriptId,
            status: 'exported',
            filePath
          });
        }
      } catch (err) {
        results.push({
          scriptId,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const successful = results.filter(r => r.status === 'exported' || r.status === 'transferred').length;

    return success({
      total: args.scriptIds.length,
      successful,
      failed: args.scriptIds.length - successful,
      results
    });
  } catch (err) {
    return error(`Batch export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: cleanup_exports
export async function cleanupExports(args: {
  olderThanHours?: number;
  format?: 'rtf' | 'html' | 'txt' | 'all';
}): Promise<ToolResult> {
  try {
    ensureExportDir();

    const olderThan = args.olderThanHours || 24;
    const cutoff = Date.now() - (olderThan * 60 * 60 * 1000);

    const files = readdirSync(EXPORT_DIR);
    let deleted = 0;
    const deletedFiles: string[] = [];

    for (const file of files) {
      // Check format filter
      if (args.format && args.format !== 'all') {
        if (!file.endsWith(`.${args.format}`)) continue;
      }

      const filePath = join(EXPORT_DIR, file);

      // Check age (use filename timestamp)
      const match = file.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
      if (match) {
        const fileDate = new Date(match[1].replace(/-/g, (m, i) => i > 9 ? ':' : '-')).getTime();
        if (fileDate < cutoff) {
          unlinkSync(filePath);
          deleted++;
          deletedFiles.push(file);
        }
      }
    }

    // Clean up export tracking
    for (const [id, exp] of exports.entries()) {
      const expTime = new Date(exp.createdAt).getTime();
      if (expTime < cutoff) {
        exports.delete(id);
      }
    }

    return success({
      status: 'cleaned',
      deleted,
      deletedFiles,
      remainingFiles: files.length - deleted
    });
  } catch (err) {
    return error(`Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: export_rtf
export async function exportRTF(args: {
  scriptId: string;
  theme?: 'light' | 'dark' | 'sepia';
}): Promise<ToolResult> {
  return exportTeleprompter({
    scriptId: args.scriptId,
    format: 'rtf',
    theme: args.theme
  });
}

// Tool: export_html
export async function exportHTML(args: {
  scriptId: string;
  theme?: 'light' | 'dark';
  autoScroll?: boolean;
}): Promise<ToolResult> {
  return exportTeleprompter({
    scriptId: args.scriptId,
    format: 'html',
    theme: args.theme
  });
}

// Export tool definitions
export const teleprompterToolDefinitions = [
  {
    name: 'export_teleprompter',
    description: 'Export a script to teleprompter format (RTF, HTML, or TXT)',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Script ID to export' },
        format: { type: 'string', enum: ['rtf', 'html', 'txt'], description: 'Export format' },
        theme: { type: 'string', enum: ['light', 'dark', 'sepia'], description: 'Color theme' },
        options: { type: 'object', description: 'Format options' }
      },
      required: ['scriptId', 'format']
    }
  },
  {
    name: 'airdrop_to_ipad',
    description: 'Send a file to iPad via AirDrop (macOS only)',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to file to send' },
        device: { type: 'string', description: 'Target device name (default: iPad)' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'batch_export_and_transfer',
    description: 'Export multiple scripts and optionally AirDrop them',
    inputSchema: {
      type: 'object',
      properties: {
        scriptIds: { type: 'array', items: { type: 'string' }, description: 'Script IDs to export' },
        format: { type: 'string', enum: ['rtf', 'html', 'txt'], description: 'Export format' },
        airdropDevice: { type: 'string', description: 'Device to AirDrop to (optional)' }
      },
      required: ['scriptIds', 'format']
    }
  },
  {
    name: 'cleanup_exports',
    description: 'Clean up old export files',
    inputSchema: {
      type: 'object',
      properties: {
        olderThanHours: { type: 'number', description: 'Delete files older than N hours (default: 24)' },
        format: { type: 'string', enum: ['rtf', 'html', 'txt', 'all'], description: 'Format to clean (default: all)' }
      }
    }
  },
  {
    name: 'export_rtf',
    description: 'Export script to RTF format',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Script ID to export' },
        theme: { type: 'string', enum: ['light', 'dark', 'sepia'], description: 'Color theme' }
      },
      required: ['scriptId']
    }
  },
  {
    name: 'export_html',
    description: 'Export script to HTML format with optional auto-scroll',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Script ID to export' },
        theme: { type: 'string', enum: ['light', 'dark'], description: 'Color theme' },
        autoScroll: { type: 'boolean', description: 'Enable auto-scroll feature' }
      },
      required: ['scriptId']
    }
  }
];

export const teleprompterToolHandlers: Record<string, (args: unknown) => Promise<ToolResult>> = {
  export_teleprompter: (args) => exportTeleprompter(args as { scriptId: string; format: 'rtf' | 'html' | 'txt'; theme?: 'light' | 'dark' | 'sepia' }),
  airdrop_to_ipad: (args) => airdropToIpad(args as { filePath: string; device?: string }),
  batch_export_and_transfer: (args) => batchExportAndTransfer(args as { scriptIds: string[]; format: 'rtf' | 'html' | 'txt'; airdropDevice?: string }),
  cleanup_exports: (args) => cleanupExports(args as { olderThanHours?: number; format?: 'rtf' | 'html' | 'txt' | 'all' }),
  export_rtf: (args) => exportRTF(args as { scriptId: string; theme?: 'light' | 'dark' | 'sepia' }),
  export_html: (args) => exportHTML(args as { scriptId: string; theme?: 'light' | 'dark'; autoScroll?: boolean })
};
