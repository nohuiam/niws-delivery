import { existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { PLATFORM_SPECS, ENCODING_PRESETS, VIDEO_DIRS } from '../config/videoConfig.js';
import type { PlatformSpec } from '../types.js';
import {
  execFFmpeg,
  execFFprobe,
  sanitizePath,
  sanitizeText,
  sanitizeNumber
} from '../utils/shell-safe.js';

export interface ExportOptions {
  quality?: 'fast' | 'balanced' | 'quality';
  watermark?: string;
  outputDir?: string;
}

export interface ExportResult {
  platform: string;
  outputPath: string;
  fileSize?: number;
  duration?: number;
}

/**
 * Export video for a specific platform
 */
export async function exportForPlatform(
  inputPath: string,
  platform: string,
  options?: ExportOptions
): Promise<ExportResult> {
  // Validate input path
  const validInput = sanitizePath(inputPath, { mustExist: true });

  const spec = PLATFORM_SPECS[platform];
  if (!spec) {
    throw new Error(`Unknown platform: ${platform}. Available: ${Object.keys(PLATFORM_SPECS).join(', ')}`);
  }

  const qualityKey = options?.quality || 'balanced';
  const preset = ENCODING_PRESETS[qualityKey] || ENCODING_PRESETS['balanced'];
  const outputDir = options?.outputDir ? sanitizePath(options.outputDir) : VIDEO_DIRS.output;

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const inputName = basename(validInput, '.mp4');
  const outputPath = join(outputDir, `${inputName}_${platform}.mp4`);
  const validOutput = sanitizePath(outputPath);

  // Validate spec values
  const width = sanitizeNumber(spec.width, 320, 7680, 1920);
  const height = sanitizeNumber(spec.height, 240, 4320, 1080);
  const fps = sanitizeNumber(spec.fps, 1, 120, 30);
  const crf = sanitizeNumber(preset.crf, 0, 51, 23);

  // Build filter for scaling and padding
  let filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

  // Add watermark if specified - SANITIZE THE TEXT
  if (options?.watermark) {
    const safeWatermark = sanitizeText(options.watermark, { maxLength: 100 });
    filter += `,drawtext=text='${safeWatermark}':fontsize=24:fontcolor=white@0.5:x=w-tw-10:y=h-th-10`;
  }

  const args = [
    '-y',
    '-i', validInput,
    '-vf', filter,
    '-c:v', spec.codec,
    '-preset', preset.preset,
    '-crf', crf.toString(),
    '-b:v', spec.bitrate,
    '-r', fps.toString(),
    '-c:a', 'aac',
    '-b:a', '128k',
    validOutput
  ];

  await execFFmpeg(args);

  return {
    platform,
    outputPath: validOutput
  };
}

/**
 * Export video to all specified platforms
 */
export async function exportToAllPlatforms(
  inputPath: string,
  platforms: string[],
  options?: ExportOptions
): Promise<ExportResult[]> {
  const results: ExportResult[] = [];

  for (const platform of platforms) {
    try {
      const result = await exportForPlatform(inputPath, platform, options);
      results.push(result);
    } catch (error) {
      results.push({
        platform,
        outputPath: '',
      });
    }
  }

  return results;
}

/**
 * Export video for social media with auto-framing
 */
export async function exportWithAutoFrame(
  inputPath: string,
  platform: string,
  focalPoint?: { x: number; y: number },
  options?: ExportOptions
): Promise<ExportResult> {
  // Validate path
  const validInput = sanitizePath(inputPath, { mustExist: true });

  const spec = PLATFORM_SPECS[platform];
  if (!spec) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const { width: inputWidth, height: inputHeight } = await getVideoDimensions(validInput);
  const inputAspect = inputWidth / inputHeight;

  // Validate spec values
  const targetWidth = sanitizeNumber(spec.width, 320, 7680, 1920);
  const targetHeight = sanitizeNumber(spec.height, 240, 4320, 1080);
  const targetAspect = targetWidth / targetHeight;

  let filter: string;

  if (Math.abs(inputAspect - targetAspect) < 0.1) {
    // Aspects are similar, just scale
    filter = `scale=${targetWidth}:${targetHeight}`;
  } else if (inputAspect > targetAspect) {
    // Input is wider, need to crop horizontally
    const cropWidth = Math.round(inputHeight * targetAspect);
    const focalX = sanitizeNumber(focalPoint?.x ?? 50, 0, 100, 50);
    const cropX = Math.round((focalX / 100) * (inputWidth - cropWidth));
    filter = `crop=${cropWidth}:${inputHeight}:${cropX}:0,scale=${targetWidth}:${targetHeight}`;
  } else {
    // Input is taller, need to crop vertically
    const cropHeight = Math.round(inputWidth / targetAspect);
    const focalY = sanitizeNumber(focalPoint?.y ?? 50, 0, 100, 50);
    const cropY = Math.round((focalY / 100) * (inputHeight - cropHeight));
    filter = `crop=${inputWidth}:${cropHeight}:0:${cropY},scale=${targetWidth}:${targetHeight}`;
  }

  const qualityKey = options?.quality || 'balanced';
  const preset = ENCODING_PRESETS[qualityKey] || ENCODING_PRESETS['balanced'];
  const outputDir = options?.outputDir ? sanitizePath(options.outputDir) : VIDEO_DIRS.output;
  const inputName = basename(validInput, '.mp4');
  const outputPath = join(outputDir, `${inputName}_${platform}_autoframe.mp4`);
  const validOutput = sanitizePath(outputPath);

  const crf = sanitizeNumber(preset.crf, 0, 51, 23);
  const fps = sanitizeNumber(spec.fps, 1, 120, 30);

  const args = [
    '-y',
    '-i', validInput,
    '-vf', filter,
    '-c:v', spec.codec,
    '-preset', preset.preset,
    '-crf', crf.toString(),
    '-b:v', spec.bitrate,
    '-r', fps.toString(),
    '-c:a', 'aac',
    '-b:a', '128k',
    validOutput
  ];

  await execFFmpeg(args);

  return {
    platform,
    outputPath: validOutput
  };
}

/**
 * Get optimal export settings for a platform
 */
export function getPlatformSettings(platform: string): PlatformSpec | null {
  return PLATFORM_SPECS[platform] || null;
}

/**
 * List all available platforms
 */
export function listPlatforms(): Array<{ name: string; spec: PlatformSpec }> {
  return Object.entries(PLATFORM_SPECS).map(([name, spec]) => ({ name, spec }));
}

async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
  // Path is already validated before calling this function
  const args = [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    videoPath
  ];

  const result = await execFFprobe(args);
  const info = JSON.parse(result.stdout);
  return {
    width: info.streams?.[0]?.width || 1920,
    height: info.streams?.[0]?.height || 1080
  };
}
