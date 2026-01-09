import type { PlatformSpec } from '../types.js';

// Platform-specific video specifications
export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  youtube: {
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'libx264',
    bitrate: '8M'
  },
  youtube_short: {
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'libx264',
    bitrate: '6M'
  },
  tiktok: {
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'libx264',
    bitrate: '6M'
  },
  instagram_reel: {
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'libx264',
    bitrate: '5M'
  },
  instagram_post: {
    width: 1080,
    height: 1080,
    fps: 30,
    codec: 'libx264',
    bitrate: '5M'
  },
  twitter: {
    width: 1280,
    height: 720,
    fps: 30,
    codec: 'libx264',
    bitrate: '4M'
  },
  facebook: {
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'libx264',
    bitrate: '8M'
  }
};

// Video encoding presets
export const ENCODING_PRESETS = {
  fast: {
    preset: 'veryfast',
    crf: 23
  },
  balanced: {
    preset: 'medium',
    crf: 20
  },
  quality: {
    preset: 'slow',
    crf: 18
  }
};

// Chroma key colors
export const CHROMA_KEY_COLORS = {
  green: { color: '00ff00', similarity: 0.3, blend: 0.1 },
  blue: { color: '0000ff', similarity: 0.3, blend: 0.1 },
  magenta: { color: 'ff00ff', similarity: 0.3, blend: 0.1 }
};

// Motion graphics templates
export const MOTION_GRAPHICS_TEMPLATES = {
  lower_third: {
    name: 'Lower Third',
    duration: 5,
    position: { x: 50, y: 850, width: 600, height: 100 }
  },
  title_card: {
    name: 'Title Card',
    duration: 3,
    position: { x: 100, y: 400, width: 1720, height: 280 }
  },
  news_ticker: {
    name: 'News Ticker',
    duration: -1, // Continuous
    position: { x: 0, y: 1000, width: 1920, height: 80 }
  }
};

// Default output directories
export const VIDEO_DIRS = {
  temp: process.env.VIDEO_TEMP_DIR || '/tmp/niws-video',
  output: process.env.VIDEO_OUTPUT_DIR || './data/videos',
  assets: process.env.VIDEO_ASSETS_DIR || './data/video-assets'
};

// FFmpeg path
export const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';
