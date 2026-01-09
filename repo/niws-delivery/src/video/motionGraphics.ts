import { MOTION_GRAPHICS_TEMPLATES } from '../config/videoConfig.js';
import {
  execFFmpeg,
  sanitizePath,
  sanitizeText,
  sanitizeColor,
  sanitizeNumber
} from '../utils/shell-safe.js';

export interface MotionGraphicsOptions {
  template: 'lower_third' | 'title_card' | 'news_ticker' | string;
  text?: string;
  startTime?: number;
  duration?: number;
  colors?: {
    background?: string;
    text?: string;
    accent?: string;
  };
  animation?: 'fade' | 'slide_left' | 'slide_up' | 'none';
}

/**
 * Add motion graphics overlay to video
 */
export async function addMotionGraphics(
  inputPath: string,
  outputPath: string,
  options: MotionGraphicsOptions
): Promise<void> {
  // Validate paths
  const validInput = sanitizePath(inputPath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  const template = MOTION_GRAPHICS_TEMPLATES[options.template as keyof typeof MOTION_GRAPHICS_TEMPLATES];
  if (!template) {
    throw new Error(`Unknown template: ${options.template}`);
  }

  // Sanitize text content
  const text = sanitizeText(options.text || 'NIWS', { maxLength: 500 });
  const startTime = sanitizeNumber(options.startTime ?? 0, 0, 86400, 0);
  const duration = sanitizeNumber(options.duration ?? template.duration, 0.1, 3600, 5);
  const bgColor = sanitizeColor(options.colors?.background || '0x1a1a2e');
  const textColor = sanitizeColor(options.colors?.text || 'white');

  // Build drawtext filter for text overlay
  const drawtext = buildDrawtextFilter(text, template.position, textColor, options.animation);

  // Build background box filter
  const drawbox = `drawbox=x=${template.position.x}:y=${template.position.y}:w=${template.position.width}:h=${template.position.height}:color=${bgColor}@0.8:t=fill:enable='between(t,${startTime},${startTime + duration})'`;

  const filter = `${drawbox},${drawtext}:enable='between(t,${startTime},${startTime + duration})'`;

  const args = [
    '-y',
    '-i', validInput,
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-c:a', 'copy',
    validOutput
  ];

  await execFFmpeg(args);
}

/**
 * Add lower third with name and title
 */
export async function addLowerThird(
  inputPath: string,
  outputPath: string,
  name: string,
  title: string,
  options?: { startTime?: number; duration?: number }
): Promise<void> {
  // Validate paths
  const validInput = sanitizePath(inputPath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  // Sanitize text inputs
  const safeName = sanitizeText(name, { maxLength: 100 });
  const safeTitle = sanitizeText(title, { maxLength: 200 });

  const startTime = sanitizeNumber(options?.startTime ?? 0, 0, 86400, 0);
  const duration = sanitizeNumber(options?.duration ?? 5, 0.1, 3600, 5);

  // Two-line lower third - using sanitized text
  const filter = [
    `drawbox=x=50:y=850:w=600:h=100:color=0x1a1a2e@0.8:t=fill:enable='between(t,${startTime},${startTime + duration})'`,
    `drawtext=text='${safeName}':fontfile=/System/Library/Fonts/Helvetica.ttc:fontsize=36:fontcolor=white:x=60:y=860:enable='between(t,${startTime},${startTime + duration})'`,
    `drawtext=text='${safeTitle}':fontfile=/System/Library/Fonts/Helvetica.ttc:fontsize=24:fontcolor=0xaaaaaa:x=60:y=905:enable='between(t,${startTime},${startTime + duration})'`
  ].join(',');

  const args = [
    '-y',
    '-i', validInput,
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-c:a', 'copy',
    validOutput
  ];

  await execFFmpeg(args);
}

/**
 * Add news ticker (scrolling text)
 */
export async function addNewsTicker(
  inputPath: string,
  outputPath: string,
  headlines: string[],
  options?: { speed?: number; bgColor?: string }
): Promise<void> {
  // Validate paths
  const validInput = sanitizePath(inputPath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  // Sanitize all headline text
  const safeHeadlines = headlines.map(h => sanitizeText(h, { maxLength: 200 }));
  const text = safeHeadlines.join('    •    ');

  const speed = sanitizeNumber(options?.speed ?? 100, 10, 500, 100);
  const bgColor = sanitizeColor(options?.bgColor || '0xcc0000');

  const filter = [
    `drawbox=x=0:y=1000:w=1920:h=80:color=${bgColor}@0.9:t=fill`,
    `drawtext=text='${text}':fontfile=/System/Library/Fonts/Helvetica.ttc:fontsize=32:fontcolor=white:x=w-mod(t*${speed}\\,w+tw):y=1020`
  ].join(',');

  const args = [
    '-y',
    '-i', validInput,
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-c:a', 'copy',
    validOutput
  ];

  await execFFmpeg(args);
}

/**
 * Add title card
 */
export async function addTitleCard(
  inputPath: string,
  outputPath: string,
  title: string,
  options?: { subtitle?: string; duration?: number }
): Promise<void> {
  // Validate paths
  const validInput = sanitizePath(inputPath, { mustExist: true });
  const validOutput = sanitizePath(outputPath);

  // Sanitize text
  const safeTitle = sanitizeText(title, { maxLength: 200 });
  const duration = sanitizeNumber(options?.duration ?? 3, 0.1, 60, 3);

  const filterParts = [
    `drawbox=x=100:y=400:w=1720:h=280:color=0x1a1a2e@0.9:t=fill:enable='lt(t,${duration})'`,
    `drawtext=text='${safeTitle}':fontfile=/System/Library/Fonts/Helvetica.ttc:fontsize=72:fontcolor=white:x=(w-tw)/2:y=450:enable='lt(t,${duration})'`
  ];

  if (options?.subtitle) {
    const safeSubtitle = sanitizeText(options.subtitle, { maxLength: 300 });
    filterParts.push(
      `drawtext=text='${safeSubtitle}':fontfile=/System/Library/Fonts/Helvetica.ttc:fontsize=36:fontcolor=0xaaaaaa:x=(w-tw)/2:y=550:enable='lt(t,${duration})'`
    );
  }

  const filter = filterParts.join(',');

  const args = [
    '-y',
    '-i', validInput,
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '20',
    '-c:a', 'copy',
    validOutput
  ];

  await execFFmpeg(args);
}

function buildDrawtextFilter(
  text: string,
  position: { x: number; y: number; width: number; height: number },
  color: string,
  animation?: string
): string {
  let x: number | string = position.x + 10;
  let y: number | string = position.y + (position.height / 2) - 18;

  // Animation expressions
  if (animation === 'slide_left') {
    x = -500; // Would use expression for animation
  } else if (animation === 'slide_up') {
    y = position.y + position.height;
  }

  // Text is already sanitized before being passed here
  return `drawtext=text='${text}':fontfile=/System/Library/Fonts/Helvetica.ttc:fontsize=36:fontcolor=${color}:x=${x}:y=${y}`;
}
