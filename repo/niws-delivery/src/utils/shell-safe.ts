/**
 * Shell-safe utilities for FFmpeg command execution.
 *
 * SECURITY: This module prevents command injection by:
 * 1. Validating file paths against an allowlist of characters
 * 2. Escaping all shell metacharacters in text content
 * 3. Using execFile() instead of exec() to avoid shell interpretation
 */

import { execFile, ExecFileException } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { resolve, normalize } from 'path';

const execFileAsync = promisify(execFile);

// Timeout constants
const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;   // 5 minutes for video processing
const FFPROBE_TIMEOUT_MS = 30 * 1000;       // 30 seconds for metadata queries
const FFMPEG_MAX_BUFFER = 50 * 1024 * 1024; // 50MB for video output
const FFPROBE_MAX_BUFFER = 10 * 1024 * 1024; // 10MB for metadata

// Characters allowed in file paths (conservative allowlist)
const SAFE_PATH_CHARS = /^[a-zA-Z0-9_\-./\s]+$/;

// Shell metacharacters that need escaping
const SHELL_METACHARACTERS = /[`$;|&<>(){}[\]!#*?~\\'"]/g;

// FFmpeg binary paths
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export class PathValidationError extends Error {
  constructor(path: string, reason: string) {
    // Truncate path to last component to avoid exposing directory structure
    const safePath = path.split('/').pop() || '[path]';
    super(`Invalid path ".../${safePath}": ${reason}`);
    this.name = 'PathValidationError';
  }
}

export class TextValidationError extends Error {
  constructor(text: string, reason: string) {
    super(`Invalid text content: ${reason}`);
    this.name = 'TextValidationError';
  }
}

/**
 * Validates and sanitizes a file path for safe use in shell commands.
 *
 * @param inputPath - The path to validate
 * @param options - Validation options
 * @returns Normalized, validated path
 * @throws PathValidationError if path contains dangerous characters
 */
export function sanitizePath(
  inputPath: string,
  options: {
    mustExist?: boolean;
    allowRelative?: boolean;
    maxLength?: number;
  } = {}
): string {
  const { mustExist = false, allowRelative = false, maxLength = 4096 } = options;

  if (!inputPath || typeof inputPath !== 'string') {
    throw new PathValidationError(inputPath, 'Path is empty or not a string');
  }

  // Check length
  if (inputPath.length > maxLength) {
    throw new PathValidationError(inputPath, `Path exceeds maximum length of ${maxLength}`);
  }

  // Normalize path to resolve . and ..
  const normalizedPath = normalize(inputPath);

  // Resolve to absolute if needed
  const finalPath = allowRelative ? normalizedPath : resolve(normalizedPath);

  // Check for null bytes (path traversal attack vector)
  if (finalPath.includes('\0')) {
    throw new PathValidationError(inputPath, 'Path contains null bytes');
  }

  // Check for allowed characters only
  if (!SAFE_PATH_CHARS.test(finalPath)) {
    // Find the offending character(s) for better error messages
    const badChars = finalPath.split('').filter(c => !SAFE_PATH_CHARS.test(c));
    throw new PathValidationError(
      inputPath,
      `Path contains disallowed characters: ${JSON.stringify(badChars.slice(0, 5))}`
    );
  }

  // Check existence if required
  if (mustExist && !existsSync(finalPath)) {
    throw new PathValidationError(inputPath, 'Path does not exist');
  }

  return finalPath;
}

/**
 * Validates multiple paths.
 *
 * @param paths - Array of paths to validate
 * @param options - Validation options
 * @returns Array of validated paths
 */
export function sanitizePaths(
  paths: string[],
  options: Parameters<typeof sanitizePath>[1] = {}
): string[] {
  return paths.map(p => sanitizePath(p, options));
}

/**
 * Escapes text for safe use in FFmpeg filter strings.
 *
 * FFmpeg filter text (like drawtext) requires escaping of:
 * - Single quotes (FFmpeg filter syntax)
 * - Colons (FFmpeg filter separator)
 * - Backslashes (escape character)
 * - Plus additional shell metacharacters when command is constructed
 *
 * @param text - The text to escape
 * @param options - Escape options
 * @returns Escaped text safe for FFmpeg filter strings
 */
export function sanitizeText(
  text: string,
  options: {
    maxLength?: number;
    allowNewlines?: boolean;
  } = {}
): string {
  const { maxLength = 1000, allowNewlines = false } = options;

  if (!text || typeof text !== 'string') {
    return '';
  }

  // Check length
  if (text.length > maxLength) {
    throw new TextValidationError(text, `Text exceeds maximum length of ${maxLength}`);
  }

  // Remove or escape newlines
  let sanitized = allowNewlines ? text : text.replace(/\n/g, ' ');

  // Escape for FFmpeg filter syntax (order matters)
  sanitized = sanitized
    .replace(/\\/g, '\\\\\\\\')  // Backslash -> quadruple backslash for FFmpeg
    .replace(/'/g, "'\\''")       // Single quote -> escaped single quote
    .replace(/:/g, '\\:')         // Colon -> escaped colon (FFmpeg filter separator)
    .replace(/\[/g, '\\[')        // Brackets
    .replace(/]/g, '\\]')
    .replace(/;/g, '\\;')         // Semicolon (FFmpeg filter chain)
    .replace(/,/g, '\\,');        // Comma (FFmpeg filter option separator)

  // Additional shell metacharacter escaping
  // These prevent command substitution and variable expansion
  sanitized = sanitized
    .replace(/`/g, '')            // Remove backticks entirely (command substitution)
    .replace(/\$/g, '')           // Remove dollar signs (variable expansion)
    .replace(/\|/g, '')           // Remove pipes
    .replace(/&/g, '')            // Remove ampersands
    .replace(/</g, '')            // Remove redirects
    .replace(/>/g, '')
    .replace(/!/g, '');           // Remove history expansion

  return sanitized;
}

/**
 * Executes FFmpeg with validated arguments using execFile (no shell).
 *
 * @param args - Array of FFmpeg arguments
 * @param options - Execution options
 * @returns Promise with stdout and stderr
 */
export async function execFFmpeg(
  args: string[],
  options: {
    timeout?: number;
    cwd?: string;
  } = {}
): Promise<ExecResult> {
  const { timeout = FFMPEG_TIMEOUT_MS, cwd } = options;

  try {
    const result = await execFileAsync(FFMPEG_PATH, args, {
      timeout,
      cwd,
      maxBuffer: FFMPEG_MAX_BUFFER
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (err) {
    const error = err as ExecFileException & { stdout?: string; stderr?: string };

    // FFmpeg often outputs to stderr for non-errors, check exit code
    if (error.code === 0) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }

    throw new Error(
      `FFmpeg failed with code ${error.code}: ${error.stderr || error.message}`
    );
  }
}

/**
 * Executes FFprobe with validated arguments using execFile (no shell).
 *
 * @param args - Array of FFprobe arguments
 * @param options - Execution options
 * @returns Promise with stdout and stderr
 */
export async function execFFprobe(
  args: string[],
  options: {
    timeout?: number;
    cwd?: string;
  } = {}
): Promise<ExecResult> {
  const { timeout = FFPROBE_TIMEOUT_MS, cwd } = options;

  try {
    const result = await execFileAsync(FFPROBE_PATH, args, {
      timeout,
      cwd,
      maxBuffer: FFPROBE_MAX_BUFFER
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (err) {
    const error = err as ExecFileException & { stdout?: string; stderr?: string };

    if (error.code === 0) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }

    throw new Error(
      `FFprobe failed with code ${error.code}: ${error.stderr || error.message}`
    );
  }
}

/**
 * Builds a safe FFmpeg command with validated inputs.
 * Returns an array of arguments for use with execFFmpeg.
 *
 * @param inputs - Input file paths (will be validated)
 * @param output - Output file path (will be validated)
 * @param filterComplex - Optional filter complex string
 * @param additionalArgs - Additional FFmpeg arguments
 * @returns Array of FFmpeg arguments
 */
export function buildFFmpegArgs(
  inputs: string[],
  output: string,
  filterComplex?: string,
  additionalArgs: string[] = []
): string[] {
  // Validate all paths
  const validatedInputs = sanitizePaths(inputs, { mustExist: true });
  const validatedOutput = sanitizePath(output);

  const args: string[] = ['-y']; // Overwrite output

  // Add inputs
  for (const input of validatedInputs) {
    args.push('-i', input);
  }

  // Add filter complex if provided
  if (filterComplex) {
    args.push('-filter_complex', filterComplex);
  }

  // Add additional args
  args.push(...additionalArgs);

  // Add output
  args.push(validatedOutput);

  return args;
}

/**
 * Gets video information safely using FFprobe.
 *
 * @param filePath - Path to the video file
 * @returns Parsed video information
 */
export async function getVideoInfo(filePath: string): Promise<{
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
}> {
  const validatedPath = sanitizePath(filePath, { mustExist: true });

  const result = await execFFprobe([
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    validatedPath
  ]);

  const info = JSON.parse(result.stdout);
  const videoStream = info.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');

  if (!videoStream) {
    throw new Error('No video stream found in file');
  }

  // Parse frame rate (can be "30/1" format)
  let fps = 30;
  if (videoStream.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    fps = den ? num / den : num;
  }

  return {
    width: videoStream.width || 1920,
    height: videoStream.height || 1080,
    duration: parseFloat(info.format?.duration || '0'),
    fps: Math.round(fps * 100) / 100,
    codec: videoStream.codec_name || 'unknown'
  };
}

/**
 * Validates that a color value is safe (hex or named color).
 *
 * @param color - Color string to validate
 * @returns Validated color string
 */
export function sanitizeColor(color: string): string {
  // Hex color pattern
  if (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(color)) {
    return color;
  }

  // Named colors (FFmpeg supports these)
  const namedColors = [
    'white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
    'gray', 'grey', 'orange', 'purple', 'pink', 'brown', 'navy', 'olive',
    'teal', 'lime', 'aqua', 'fuchsia', 'silver', 'maroon'
  ];

  if (namedColors.includes(color.toLowerCase())) {
    return color.toLowerCase();
  }

  // Default to white if invalid
  console.warn(`Invalid color "${color}", defaulting to white`);
  return 'white';
}

/**
 * Validates numeric values for FFmpeg parameters.
 *
 * @param value - Value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param defaultValue - Default if invalid
 * @returns Validated number
 */
export function sanitizeNumber(
  value: unknown,
  min: number,
  max: number,
  defaultValue: number
): number {
  const num = Number(value);

  if (isNaN(num) || num < min || num > max) {
    return defaultValue;
  }

  return num;
}
