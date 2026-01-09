import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import type { VideoJob, VideoPipelineOptions } from '../types.js';
import { PLATFORM_SPECS, VIDEO_DIRS, ENCODING_PRESETS } from '../config/videoConfig.js';
import {
  execFFmpeg,
  execFFprobe,
  sanitizePath,
  sanitizeNumber,
  PathValidationError
} from '../utils/shell-safe.js';
import { getDatabase } from '../database/schema.js';

export class VideoOrchestrator {
  private ffmpegAvailable = true;

  constructor() {
    // Ensure directories exist
    for (const dir of Object.values(VIDEO_DIRS)) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Check FFmpeg availability (non-blocking)
    this.checkFFmpegAvailable();
  }

  /**
   * Check if FFmpeg is available on the system.
   */
  private async checkFFmpegAvailable(): Promise<void> {
    try {
      await execFFprobe(['-version']);
    } catch {
      this.ffmpegAvailable = false;
      console.warn('[VideoOrchestrator] FFmpeg not available - video features disabled');
    }
  }

  async runPipeline(options: VideoPipelineOptions): Promise<string> {
    if (!this.ffmpegAvailable) {
      throw new Error('Video processing unavailable: FFmpeg not installed');
    }

    const db = getDatabase();
    const jobId = `video_${uuidv4().slice(0, 8)}`;
    const job: VideoJob = {
      id: jobId,
      scriptId: options.scriptId,
      status: 'queued',
      platforms: options.platforms,
      config: { chromaKeySource: options.chromaKeySource, motionGraphics: options.motionGraphics },
      createdAt: new Date().toISOString(),
      progress: 0
    };

    // Persist job to database
    db.insertVideoJob(job);

    // Run async pipeline
    this.executePipeline(jobId, options).catch(err => {
      db.updateVideoJob(jobId, {
        status: 'failed',
        error: err instanceof Error ? err.message : String(err)
      });
    });

    return jobId;
  }

  private async executePipeline(jobId: string, options: VideoPipelineOptions): Promise<void> {
    const db = getDatabase();

    const updateProgress = (progress: number, updates?: Partial<VideoJob>) => {
      db.updateVideoJob(jobId, { progress, ...updates });
    };

    try {
      updateProgress(10, { status: 'processing' });

      const tempDir = join(VIDEO_DIRS.temp, jobId);
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      // Step 1: Build background (20%)
      const backgroundPath = join(tempDir, 'background.mp4');
      await this.buildBackground(options, backgroundPath);
      updateProgress(20);

      // Step 2: Apply chroma key if needed (40%)
      let compositePath = backgroundPath;
      if (options.chromaKeySource) {
        compositePath = join(tempDir, 'chroma_composite.mp4');
        await this.applyChromaKey(options.chromaKeySource, backgroundPath, compositePath);
      }
      updateProgress(40);

      // Step 3: Add motion graphics if needed (60%)
      if (options.motionGraphics) {
        const motionPath = join(tempDir, 'with_graphics.mp4');
        await this.addMotionGraphics(compositePath, options.motionGraphics, motionPath);
        compositePath = motionPath;
      }
      updateProgress(60);

      // Step 4: Export to all platforms (100%)
      const outputPaths: string[] = [];
      const progressPerPlatform = 40 / options.platforms.length;

      for (let i = 0; i < options.platforms.length; i++) {
        const platform = options.platforms[i];
        const outputPath = join(VIDEO_DIRS.output, `${jobId}_${platform}.mp4`);
        await this.exportForPlatform(compositePath, platform, outputPath);
        outputPaths.push(outputPath);
        updateProgress(60 + Math.round((i + 1) * progressPerPlatform));
      }

      // Cleanup temp files
      await this.cleanupTemp(tempDir);

      // Mark job complete
      db.updateVideoJob(jobId, {
        status: 'complete',
        progress: 100,
        outputPath: outputPaths[0],
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      db.updateVideoJob(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async buildBackground(options: VideoPipelineOptions, outputPath: string): Promise<void> {
    const resolution = options.resolution || { width: 1920, height: 1080, fps: 30 };
    const duration = sanitizeNumber(60, 1, 3600, 60); // Max 1 hour

    // Validate output path
    const validOutput = sanitizePath(outputPath);

    // Validate resolution values
    const width = sanitizeNumber(resolution.width, 320, 7680, 1920);
    const height = sanitizeNumber(resolution.height, 240, 4320, 1080);
    const fps = sanitizeNumber(resolution.fps, 1, 120, 30);

    // Build FFmpeg args as array (no shell interpretation)
    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=0x1a1a2e:s=${width}x${height}:d=${duration}:r=${fps}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      validOutput
    ];

    await execFFmpeg(args);
  }

  async applyChromaKey(foregroundPath: string, backgroundPath: string, outputPath: string): Promise<void> {
    // Validate all paths
    const validForeground = sanitizePath(foregroundPath, { mustExist: true });
    const validBackground = sanitizePath(backgroundPath, { mustExist: true });
    const validOutput = sanitizePath(outputPath);

    // FFmpeg chromakey filter - args as array
    const args = [
      '-y',
      '-i', validBackground,
      '-i', validForeground,
      '-filter_complex', '[1:v]chromakey=0x00ff00:0.3:0.1[fg];[0:v][fg]overlay=shortest=1',
      '-c:v', 'libx264',
      '-preset', 'medium',
      validOutput
    ];

    await execFFmpeg(args);
  }

  async addMotionGraphics(inputPath: string, _options: unknown, outputPath: string): Promise<void> {
    // Validate paths
    const validInput = sanitizePath(inputPath, { mustExist: true });
    const validOutput = sanitizePath(outputPath);

    // In production, this would overlay motion graphics
    // For now, just copy the input
    const args = ['-y', '-i', validInput, '-c', 'copy', validOutput];
    await execFFmpeg(args);
  }

  async exportForPlatform(inputPath: string, platform: string, outputPath: string): Promise<void> {
    // Validate paths
    const validInput = sanitizePath(inputPath, { mustExist: true });
    const validOutput = sanitizePath(outputPath);

    const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS['youtube'];
    const preset = ENCODING_PRESETS['balanced'];

    // Validate numeric values from spec
    const width = sanitizeNumber(spec.width, 320, 7680, 1920);
    const height = sanitizeNumber(spec.height, 240, 4320, 1080);
    const fps = sanitizeNumber(spec.fps, 1, 120, 30);
    const crf = sanitizeNumber(preset.crf, 0, 51, 23);

    const args = [
      '-y',
      '-i', validInput,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
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
  }

  async encodeVideo(inputPath: string, outputPath: string, options?: { preset?: string; codec?: string }): Promise<void> {
    // Validate paths
    const validInput = sanitizePath(inputPath, { mustExist: true });
    const validOutput = sanitizePath(outputPath);

    // Validate preset and codec (allowlist)
    const allowedPresets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
    const allowedCodecs = ['libx264', 'libx265', 'libvpx', 'libvpx-vp9'];

    const preset = allowedPresets.includes(options?.preset || '') ? options!.preset : 'medium';
    const codec = allowedCodecs.includes(options?.codec || '') ? options!.codec : 'libx264';

    const args = ['-y', '-i', validInput, '-c:v', codec!, '-preset', preset!, '-crf', '20', validOutput];
    await execFFmpeg(args);
  }

  async generatePreview(inputPath: string, outputPath: string, duration: number = 10): Promise<void> {
    // Validate paths
    const validInput = sanitizePath(inputPath, { mustExist: true });
    const validOutput = sanitizePath(outputPath);

    // Validate duration
    const validDuration = sanitizeNumber(duration, 1, 300, 10);

    const args = [
      '-y',
      '-i', validInput,
      '-t', validDuration.toString(),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-vf', 'scale=640:-1',
      validOutput
    ];

    await execFFmpeg(args);
  }

  async getVideoInfo(filePath: string): Promise<{ duration: number; width: number; height: number; codec: string }> {
    // Validate path
    const validPath = sanitizePath(filePath, { mustExist: true });

    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name,duration',
      '-of', 'json',
      validPath
    ];

    const result = await execFFprobe(args);

    // Safely parse FFprobe output
    let info;
    try {
      info = JSON.parse(result.stdout);
    } catch {
      throw new Error('Failed to parse FFprobe output');
    }

    const stream = info.streams?.[0] || {};

    // Use sanitizeNumber for validation to prevent NaN propagation
    return {
      duration: sanitizeNumber(parseFloat(stream.duration), 0, 86400, 0), // Max 24h
      width: sanitizeNumber(stream.width, 1, 7680, 1920),
      height: sanitizeNumber(stream.height, 1, 4320, 1080),
      codec: typeof stream.codec_name === 'string' ? stream.codec_name : 'unknown'
    };
  }

  private async cleanupTemp(tempDir: string): Promise<void> {
    try {
      const files = readdirSync(tempDir);
      for (const file of files) {
        unlinkSync(join(tempDir, file));
      }
    } catch (err) {
      // Log cleanup errors but don't fail the job
      console.warn(`[VideoOrchestrator] Failed to cleanup ${tempDir}:`, err instanceof Error ? err.message : String(err));
    }
  }

  getJob(jobId: string): VideoJob | undefined {
    const db = getDatabase();
    return db.getVideoJob(jobId) || undefined;
  }

  getAllJobs(): VideoJob[] {
    const db = getDatabase();
    return db.listVideoJobs();
  }

  cancelJob(jobId: string): boolean {
    const db = getDatabase();
    const job = db.getVideoJob(jobId);
    if (job && (job.status === 'queued' || job.status === 'processing')) {
      db.updateVideoJob(jobId, {
        status: 'failed',
        error: 'Cancelled by user'
      });
      return true;
    }
    return false;
  }

  async listAssets(): Promise<Array<{ name: string; path: string; type: string; size: number }>> {
    const assets: Array<{ name: string; path: string; type: string; size: number }> = [];

    if (existsSync(VIDEO_DIRS.assets)) {
      const files = readdirSync(VIDEO_DIRS.assets, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile()) {
          const ext = file.name.split('.').pop() || '';
          assets.push({
            name: file.name,
            path: join(VIDEO_DIRS.assets, file.name),
            type: ext,
            size: 0 // Would get actual size
          });
        }
      }
    }

    return assets;
  }

  async cleanupOldVideos(olderThanHours: number = 24): Promise<number> {
    const db = getDatabase();
    const cutoff = Date.now() - (olderThanHours * 60 * 60 * 1000);
    let deleted = 0;

    // Cleanup temp directory
    if (existsSync(VIDEO_DIRS.temp)) {
      const dirs = readdirSync(VIDEO_DIRS.temp, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory()) {
          // Check job creation time
          const jobId = dir.name;
          const job = db.getVideoJob(jobId);
          if (job) {
            const jobTime = new Date(job.createdAt).getTime();
            if (jobTime < cutoff && job.status !== 'processing') {
              await this.cleanupTemp(join(VIDEO_DIRS.temp, jobId));
              deleted++;
            }
          }
        }
      }
    }

    return deleted;
  }

  /**
   * Resume any incomplete jobs from database on startup.
   * Jobs that were 'processing' when server stopped are marked as failed.
   */
  initialize(): void {
    const db = getDatabase();
    const jobs = db.listVideoJobs();

    for (const job of jobs) {
      if (job.status === 'processing') {
        console.log(`[VideoOrchestrator] Marking interrupted job as failed: ${job.id}`);
        db.updateVideoJob(job.id, {
          status: 'failed',
          error: 'Server restarted during processing'
        });
      }
    }
  }
}

export const videoOrchestrator = new VideoOrchestrator();
