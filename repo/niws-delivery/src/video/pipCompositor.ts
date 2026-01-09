import {
  execFFmpeg,
  execFFprobe,
  sanitizePath,
  sanitizePaths,
  sanitizeText,
  sanitizeColor,
  sanitizeNumber
} from '../utils/shell-safe.js';

export interface PiPPosition {
  x: number | 'left' | 'right' | 'center';
  y: number | 'top' | 'bottom' | 'center';
  width: number | string;  // pixels or percentage like '25%'
  height: number | string;
}

export interface PiPOptions {
  position: PiPPosition;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  cornerRadius?: number;
  startTime?: number;
  endTime?: number;
}

const DEFAULT_PIP_OPTIONS: PiPOptions = {
  position: { x: 'right', y: 'bottom', width: '25%', height: '25%' },
  borderWidth: 2,
  borderColor: 'white',
  shadow: true
};

/**
 * Create picture-in-picture composite
 */
export async function createPiPComposite(
  mainVideoPath: string,
  pipVideoPath: string,
  outputPath: string,
  options?: Partial<PiPOptions>
): Promise<void> {
  // Validate all paths
  const validMain = sanitizePath(mainVideoPath, { mustExist: true });
  const validPip = sanitizePath(pipVideoPath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  const opts = { ...DEFAULT_PIP_OPTIONS, ...options };

  // Get main video dimensions for positioning
  const { width: mainWidth, height: mainHeight } = await getVideoDimensions(validMain);

  // Calculate PiP dimensions
  const pipWidth = parseDimension(opts.position.width, mainWidth);
  const pipHeight = parseDimension(opts.position.height, mainHeight);

  // Calculate position
  const pipX = calculatePosition(opts.position.x, mainWidth, pipWidth, 20);
  const pipY = calculatePosition(opts.position.y, mainHeight, pipHeight, 20);

  // Sanitize border color
  const borderColor = sanitizeColor(opts.borderColor || 'white');
  const borderWidth = sanitizeNumber(opts.borderWidth ?? 2, 0, 20, 2);

  // Build filter complex
  let filter = `[1:v]scale=${pipWidth}:${pipHeight}`;

  // Add border if specified
  if (borderWidth > 0) {
    filter += `,pad=w=iw+${borderWidth * 2}:h=ih+${borderWidth * 2}:x=${borderWidth}:y=${borderWidth}:color=${borderColor}`;
  }

  filter += `[pip];[0:v][pip]overlay=${pipX}:${pipY}`;

  // Add time constraints if specified
  if (opts.startTime !== undefined || opts.endTime !== undefined) {
    const start = sanitizeNumber(opts.startTime ?? 0, 0, 86400, 0);
    const end = sanitizeNumber(opts.endTime ?? 99999, 0, 86400, 99999);
    filter += `:enable='between(t,${start},${end})'`;
  }

  const args = [
    '-y',
    '-i', validMain,
    '-i', validPip,
    '-filter_complex', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-c:a', 'aac',
    validOutput
  ];

  await execFFmpeg(args);
}

/**
 * Create side-by-side comparison
 */
export async function createSideBySide(
  leftVideoPath: string,
  rightVideoPath: string,
  outputPath: string,
  options?: { gap?: number; labels?: [string, string] }
): Promise<void> {
  // Validate paths
  const validLeft = sanitizePath(leftVideoPath, { mustExist: true });
  const validRight = sanitizePath(rightVideoPath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  let filter = `[0:v]scale=940:-1[left];[1:v]scale=940:-1[right];[left][right]hstack=inputs=2`;

  // Add labels if specified - SANITIZE THE LABELS
  if (options?.labels) {
    const leftLabel = sanitizeText(options.labels[0], { maxLength: 50 });
    const rightLabel = sanitizeText(options.labels[1], { maxLength: 50 });

    filter = `[0:v]scale=940:-1,drawtext=text='${leftLabel}':fontsize=24:fontcolor=white:x=10:y=10[left];` +
             `[1:v]scale=940:-1,drawtext=text='${rightLabel}':fontsize=24:fontcolor=white:x=10:y=10[right];` +
             `[left][right]hstack=inputs=2`;
  }

  const args = [
    '-y',
    '-i', validLeft,
    '-i', validRight,
    '-filter_complex', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    validOutput
  ];

  await execFFmpeg(args);
}

/**
 * Create grid layout with multiple videos
 */
export async function createGridLayout(
  videoPaths: string[],
  outputPath: string,
  options?: { columns?: number; cellWidth?: number; cellHeight?: number }
): Promise<void> {
  // Validate all paths
  const validPaths = sanitizePaths(videoPaths, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  const cols = sanitizeNumber(options?.columns ?? 2, 1, 10, 2);
  const cellWidth = sanitizeNumber(options?.cellWidth ?? 960, 100, 7680, 960);
  const cellHeight = sanitizeNumber(options?.cellHeight ?? 540, 100, 4320, 540);
  const rows = Math.ceil(validPaths.length / cols);

  // Build args with inputs
  const args: string[] = ['-y'];

  // Add all input files
  for (const path of validPaths) {
    args.push('-i', path);
  }

  // Build filter complex for grid
  let scales = '';

  for (let i = 0; i < validPaths.length; i++) {
    scales += `[${i}:v]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=decrease,pad=${cellWidth}:${cellHeight}:(ow-iw)/2:(oh-ih)/2[v${i}];`;
  }

  // Pad with black if needed to fill grid
  const totalCells = rows * cols;
  for (let i = validPaths.length; i < totalCells; i++) {
    scales += `color=c=black:s=${cellWidth}x${cellHeight}[v${i}];`;
  }

  // Build xstack layout
  const layout = buildGridLayout(rows, cols, cellWidth, cellHeight);
  const stackInputs = Array.from({ length: totalCells }, (_, i) => `[v${i}]`).join('');

  const filter = `${scales}${stackInputs}xstack=inputs=${totalCells}:layout=${layout}`;

  args.push('-filter_complex', filter);
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20');
  args.push(validOutput);

  await execFFmpeg(args);
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

function parseDimension(value: number | string, parentSize: number): number {
  if (typeof value === 'number') {
    return sanitizeNumber(value, 1, 7680, parentSize / 4);
  }
  if (typeof value === 'string' && value.endsWith('%')) {
    const percent = parseFloat(value);
    if (!isNaN(percent) && percent > 0 && percent <= 100) {
      return Math.round(parentSize * percent / 100);
    }
  }
  return Math.round(parentSize / 4);
}

function calculatePosition(
  position: number | 'left' | 'right' | 'center' | 'top' | 'bottom',
  parentSize: number,
  childSize: number,
  margin: number
): number {
  if (typeof position === 'number') {
    return sanitizeNumber(position, 0, parentSize - childSize, margin);
  }
  switch (position) {
    case 'left':
    case 'top':
      return margin;
    case 'right':
    case 'bottom':
      return parentSize - childSize - margin;
    case 'center':
      return Math.round((parentSize - childSize) / 2);
    default:
      return margin;
  }
}

function buildGridLayout(rows: number, cols: number, cellWidth: number, cellHeight: number): string {
  const positions: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      positions.push(`${col * cellWidth}_${row * cellHeight}`);
    }
  }
  return positions.join('|');
}
