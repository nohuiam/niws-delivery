import { CHROMA_KEY_COLORS } from '../config/videoConfig.js';
import {
  execFFmpeg,
  execFFprobe,
  sanitizePath,
  sanitizeColor,
  sanitizeNumber
} from '../utils/shell-safe.js';

export interface ChromaKeyOptions {
  keyColor: 'green' | 'blue' | 'magenta' | string;
  similarity?: number;   // 0.0 - 1.0 (default 0.3)
  blend?: number;        // 0.0 - 1.0 (default 0.1)
  spill?: boolean;       // Enable spill suppression
}

/**
 * Apply chroma key (green screen) effect
 */
export async function applyChromaKey(
  foregroundPath: string,
  backgroundPath: string,
  outputPath: string,
  options?: ChromaKeyOptions
): Promise<void> {
  // Validate all paths
  const validForeground = sanitizePath(foregroundPath, { mustExist: true });
  const validBackground = sanitizePath(backgroundPath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  const keyColor = getKeyColor(options?.keyColor || 'green');
  const similarity = sanitizeNumber(options?.similarity ?? 0.3, 0, 1, 0.3);
  const blend = sanitizeNumber(options?.blend ?? 0.1, 0, 1, 0.1);

  // Build filter complex
  let filter = `[1:v]chromakey=${keyColor}:${similarity}:${blend}`;

  // Add spill suppression if requested
  if (options?.spill) {
    filter += `,despill=type=green`;
  }

  filter += `[fg];[0:v][fg]overlay=shortest=1`;

  const args = [
    '-y',
    '-i', validBackground,
    '-i', validForeground,
    '-filter_complex', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    validOutput
  ];

  await execFFmpeg(args);
}

/**
 * Analyze video for chroma key color
 */
export async function detectChromaKeyColor(videoPath: string): Promise<{ color: string; confidence: number }> {
  // Validate path
  const validPath = sanitizePath(videoPath, { mustExist: true });

  // Use FFmpeg to analyze dominant colors in corners (typical green screen placement)
  const args = [
    '-i', validPath,
    '-vf', 'crop=100:100:0:0,fps=1',
    '-frames:v', '1',
    '-f', 'null',
    '-'
  ];

  try {
    await execFFmpeg(args);
    // In production, would analyze output for dominant color
    // For now, assume green screen
    return { color: 'green', confidence: 0.8 };
  } catch {
    return { color: 'green', confidence: 0.5 };
  }
}

/**
 * Create a chroma key preview
 */
export async function createChromaKeyPreview(
  foregroundPath: string,
  outputPath: string,
  options?: ChromaKeyOptions
): Promise<void> {
  // Validate paths
  const validForeground = sanitizePath(foregroundPath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  const keyColor = getKeyColor(options?.keyColor || 'green');
  const similarity = sanitizeNumber(options?.similarity ?? 0.3, 0, 1, 0.3);
  const blend = sanitizeNumber(options?.blend ?? 0.1, 0, 1, 0.1);

  // Create split view: original | keyed with transparency visualization
  const filter = `split[a][b];[a]crop=iw/2:ih:0:0[left];[b]chromakey=${keyColor}:${similarity}:${blend},format=rgba[right];[left][right]hstack`;

  const args = [
    '-y',
    '-i', validForeground,
    '-vf', filter,
    '-t', '5',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    validOutput
  ];

  await execFFmpeg(args);
}

function getKeyColor(color: 'green' | 'blue' | 'magenta' | string): string {
  if (color in CHROMA_KEY_COLORS) {
    return `0x${CHROMA_KEY_COLORS[color as keyof typeof CHROMA_KEY_COLORS].color}`;
  }
  // Validate hex color format
  if (/^(0x)?[0-9A-Fa-f]{6}$/.test(color)) {
    return color.startsWith('0x') ? color : `0x${color}`;
  }
  // Default to green if invalid
  return `0x${CHROMA_KEY_COLORS.green.color}`;
}
