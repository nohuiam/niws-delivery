import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { VIDEO_DIRS } from '../config/videoConfig.js';
import {
  execFFmpeg,
  execFFprobe,
  sanitizePath,
  sanitizeNumber
} from '../utils/shell-safe.js';

export interface ScrollCaptureOptions {
  scrollSpeed?: number;      // Pixels per second
  duration?: number;         // Total duration in seconds
  fps?: number;              // Frames per second
  resolution?: { width: number; height: number };
  direction?: 'up' | 'down' | 'left' | 'right';
}

const DEFAULT_SCROLL_OPTIONS: ScrollCaptureOptions = {
  scrollSpeed: 100,
  fps: 30,
  resolution: { width: 1920, height: 1080 },
  direction: 'up'
};

/**
 * Create a scrolling video from a tall image
 */
export async function createScrollingVideo(
  imagePath: string,
  outputPath: string,
  options?: ScrollCaptureOptions
): Promise<void> {
  // Validate paths
  const validImage = sanitizePath(imagePath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  const opts = { ...DEFAULT_SCROLL_OPTIONS, ...options };

  // Get image dimensions
  const { width, height } = await getImageDimensions(validImage);

  // Validate and sanitize options
  const resWidth = sanitizeNumber(opts.resolution?.width ?? 1920, 320, 7680, 1920);
  const resHeight = sanitizeNumber(opts.resolution?.height ?? 1080, 240, 4320, 1080);
  const scrollSpeed = sanitizeNumber(opts.scrollSpeed ?? 100, 1, 1000, 100);
  const fps = sanitizeNumber(opts.fps ?? 30, 1, 120, 30);

  // Calculate scroll parameters
  const viewportHeight = resHeight;
  const scrollableHeight = height - viewportHeight;

  if (scrollableHeight <= 0) {
    throw new Error('Image is not tall enough to scroll');
  }

  // Calculate duration if not specified
  const duration = sanitizeNumber(
    opts.duration || Math.ceil(scrollableHeight / scrollSpeed),
    1,
    3600,
    60
  );

  // Build the scroll animation filter
  // y position moves from 0 to scrollableHeight over duration
  const yExpr = opts.direction === 'up'
    ? `'${scrollableHeight}*t/${duration}'`
    : `'${scrollableHeight}*(1-t/${duration})'`;

  const filter = `crop=${resWidth}:${viewportHeight}:0:${yExpr}`;

  const args = [
    '-y',
    '-loop', '1',
    '-i', validImage,
    '-vf', filter,
    '-t', duration.toString(),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-r', fps.toString(),
    validOutput
  ];

  await execFFmpeg(args);
}

/**
 * Create a Ken Burns effect video from an image
 */
export async function createKenBurnsVideo(
  imagePath: string,
  outputPath: string,
  options?: {
    duration?: number;
    startZoom?: number;    // 1.0 = 100%
    endZoom?: number;
    startX?: number;       // 0-100 percentage
    startY?: number;
    endX?: number;
    endY?: number;
    fps?: number;
  }
): Promise<void> {
  // Validate paths
  const validImage = sanitizePath(imagePath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  const duration = sanitizeNumber(options?.duration ?? 10, 1, 300, 10);
  const startZoom = sanitizeNumber(options?.startZoom ?? 1.0, 0.5, 5.0, 1.0);
  const endZoom = sanitizeNumber(options?.endZoom ?? 1.2, 0.5, 5.0, 1.2);
  const fps = sanitizeNumber(options?.fps ?? 30, 1, 120, 30);

  // Calculate zoom and pan expressions
  // zoompan filter: zoom, x, y expressions
  const zoomExpr = `'${startZoom}+(${endZoom - startZoom})*on/${duration * fps}'`;

  // Center the zoom for now (can be customized with startX/Y, endX/Y)
  const xExpr = `'(iw-iw/zoom)/2'`;
  const yExpr = `'(ih-ih/zoom)/2'`;

  const filter = `zoompan=z=${zoomExpr}:x=${xExpr}:y=${yExpr}:d=${duration * fps}:s=1920x1080:fps=${fps}`;

  const args = [
    '-y',
    '-i', validImage,
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-t', duration.toString(),
    validOutput
  ];

  await execFFmpeg(args);
}

/**
 * Capture a sequence of screenshots and create a video
 */
export async function createVideoFromScreenshots(
  screenshotDir: string,
  outputPath: string,
  options?: {
    pattern?: string;      // e.g., 'screenshot_%03d.png'
    fps?: number;
    transition?: 'none' | 'fade' | 'dissolve';
    transitionDuration?: number;
  }
): Promise<void> {
  // Validate paths
  const validDir = sanitizePath(screenshotDir, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  // Validate pattern - only allow safe characters
  const pattern = options?.pattern ?? 'screenshot_%03d.png';
  if (!/^[a-zA-Z0-9_%-]+\.(png|jpg|jpeg|bmp)$/i.test(pattern)) {
    throw new Error('Invalid pattern format. Use alphanumeric characters with %d placeholder.');
  }

  const fps = sanitizeNumber(options?.fps ?? 1, 1, 60, 1);
  const inputPattern = join(validDir, pattern);

  const args = ['-y', '-framerate', fps.toString(), '-i', inputPattern];

  if (options?.transition === 'fade' || options?.transition === 'dissolve') {
    const transitionDuration = sanitizeNumber(options.transitionDuration ?? 0.5, 0.1, 5, 0.5);
    args.push('-vf', `fade=t=in:st=0:d=${transitionDuration},fade=t=out:st='(n-1)/${fps}-${transitionDuration}':d=${transitionDuration}`);
  }

  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', validOutput);

  await execFFmpeg(args);
}

/**
 * Create a timelapse from a folder of images
 */
export async function createTimelapse(
  imageDir: string,
  outputPath: string,
  options?: {
    fps?: number;
    resolution?: { width: number; height: number };
    speedMultiplier?: number;
  }
): Promise<void> {
  // Validate paths
  const validImageDir = sanitizePath(imageDir, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  const fps = sanitizeNumber(options?.fps ?? 30, 1, 120, 30);
  const resWidth = sanitizeNumber(options?.resolution?.width ?? 1920, 320, 7680, 1920);
  const resHeight = sanitizeNumber(options?.resolution?.height ?? 1080, 240, 4320, 1080);

  // Get list of images - validate each filename
  const files = readdirSync(validImageDir)
    .filter(f => /^[a-zA-Z0-9_\-. ]+\.(jpg|jpeg|png|bmp)$/i.test(f))
    .sort();

  if (files.length === 0) {
    throw new Error('No valid images found in directory');
  }

  // Create a concat file with validated paths
  const tempDir = join(VIDEO_DIRS.temp, `timelapse_${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const concatFile = join(tempDir, 'concat.txt');

  // Build concat content - each path is validated
  const concatLines: string[] = [];
  for (const file of files) {
    // Re-validate the full path to ensure safety
    const fullPath = sanitizePath(join(validImageDir, file), { mustExist: true });
    // FFmpeg concat format: file 'path'
    // Escape single quotes in the path
    const escapedPath = fullPath.replace(/'/g, "'\\''");
    concatLines.push(`file '${escapedPath}'`);
  }

  writeFileSync(concatFile, concatLines.join('\n'));

  const filter = `scale=${resWidth}:${resHeight}:force_original_aspect_ratio=decrease,pad=${resWidth}:${resHeight}:(ow-iw)/2:(oh-ih)/2`;

  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-r', fps.toString(),
    validOutput
  ];

  try {
    await execFFmpeg(args);
  } finally {
    // Cleanup
    try {
      unlinkSync(concatFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  // Path is already validated before calling this function
  const args = [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    imagePath
  ];

  const result = await execFFprobe(args);
  const info = JSON.parse(result.stdout);
  return {
    width: info.streams?.[0]?.width || 1920,
    height: info.streams?.[0]?.height || 1080
  };
}
