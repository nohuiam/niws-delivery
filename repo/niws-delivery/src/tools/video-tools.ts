import { videoOrchestrator } from '../services/videoOrchestrator.js';
import { applyChromaKey, createChromaKeyPreview } from '../video/chromaKey.js';
import { addMotionGraphics, addLowerThird, addNewsTicker, addTitleCard } from '../video/motionGraphics.js';
import { createPiPComposite, createSideBySide, createGridLayout } from '../video/pipCompositor.js';
import { exportForPlatform, exportToAllPlatforms, listPlatforms } from '../video/multiPlatformExport.js';
import { createScrollingVideo, createKenBurnsVideo } from '../video/scrollCapture.js';
import { PLATFORM_SPECS, VIDEO_DIRS } from '../config/videoConfig.js';
import { existsSync } from 'fs';

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

// Tool: build_video_background
export async function buildVideoBackground(args: {
  scriptId: string;
  duration?: number;
  resolution?: { width: number; height: number; fps?: number };
}): Promise<ToolResult> {
  try {
    const resolution = args.resolution ? {
      width: args.resolution.width,
      height: args.resolution.height,
      fps: args.resolution.fps || 30
    } : undefined;

    const jobId = await videoOrchestrator.runPipeline({
      scriptId: args.scriptId,
      platforms: ['youtube'],
      resolution
    });

    return success({
      status: 'building',
      jobId,
      scriptId: args.scriptId
    });
  } catch (err) {
    return error(`Failed to build video background: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: composite_final_video
export async function compositeFinalVideo(args: {
  backgroundPath: string;
  foregroundPath?: string;
  outputPath: string;
  chromaKey?: boolean;
}): Promise<ToolResult> {
  try {
    if (!existsSync(args.backgroundPath)) {
      return error(`Background video not found: ${args.backgroundPath}`);
    }

    if (args.chromaKey && args.foregroundPath) {
      if (!existsSync(args.foregroundPath)) {
        return error(`Foreground video not found: ${args.foregroundPath}`);
      }
      await applyChromaKey(args.foregroundPath, args.backgroundPath, args.outputPath);
    } else {
      // Just copy background as final
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync(`cp "${args.backgroundPath}" "${args.outputPath}"`);
    }

    return success({
      status: 'composited',
      outputPath: args.outputPath
    });
  } catch (err) {
    return error(`Failed to composite video: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: export_all_platforms
export async function exportAllPlatforms(args: {
  inputPath: string;
  platforms: string[];
  quality?: 'fast' | 'balanced' | 'quality';
}): Promise<ToolResult> {
  try {
    if (!existsSync(args.inputPath)) {
      return error(`Input video not found: ${args.inputPath}`);
    }

    const results = await exportToAllPlatforms(args.inputPath, args.platforms, {
      quality: args.quality
    });

    return success({
      status: 'exported',
      exports: results.filter(r => r.outputPath),
      failed: results.filter(r => !r.outputPath).map(r => r.platform)
    });
  } catch (err) {
    return error(`Failed to export: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: run_video_pipeline
export async function runVideoPipeline(args: {
  scriptId: string;
  platforms: string[];
  chromaKeySource?: string;
  motionGraphics?: { template: string; text?: string };
}): Promise<ToolResult> {
  try {
    const motionGraphics = args.motionGraphics ? {
      template: args.motionGraphics.template,
      text: args.motionGraphics.text ? { main: args.motionGraphics.text } : undefined
    } : undefined;

    const jobId = await videoOrchestrator.runPipeline({
      scriptId: args.scriptId,
      platforms: args.platforms,
      chromaKeySource: args.chromaKeySource,
      motionGraphics
    });

    return success({
      status: 'started',
      jobId,
      platforms: args.platforms
    });
  } catch (err) {
    return error(`Failed to run video pipeline: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: apply_chroma_key
export async function applyChromaKeyTool(args: {
  foregroundPath: string;
  backgroundPath: string;
  outputPath: string;
  keyColor?: 'green' | 'blue' | 'magenta';
  similarity?: number;
}): Promise<ToolResult> {
  try {
    await applyChromaKey(args.foregroundPath, args.backgroundPath, args.outputPath, {
      keyColor: args.keyColor || 'green',
      similarity: args.similarity
    });

    return success({
      status: 'applied',
      outputPath: args.outputPath,
      keyColor: args.keyColor || 'green'
    });
  } catch (err) {
    return error(`Failed to apply chroma key: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: add_motion_graphics
export async function addMotionGraphicsTool(args: {
  inputPath: string;
  outputPath: string;
  template: string;
  text?: string;
  startTime?: number;
  duration?: number;
}): Promise<ToolResult> {
  try {
    await addMotionGraphics(args.inputPath, args.outputPath, {
      template: args.template,
      text: args.text,
      startTime: args.startTime,
      duration: args.duration
    });

    return success({
      status: 'added',
      outputPath: args.outputPath,
      template: args.template
    });
  } catch (err) {
    return error(`Failed to add motion graphics: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: create_pip_composite
export async function createPipCompositeTool(args: {
  mainVideoPath: string;
  pipVideoPath: string;
  outputPath: string;
  position?: { x: string; y: string; width: string; height: string };
}): Promise<ToolResult> {
  try {
    await createPiPComposite(args.mainVideoPath, args.pipVideoPath, args.outputPath, {
      position: args.position ? {
        x: args.position.x as 'left' | 'right' | 'center',
        y: args.position.y as 'top' | 'bottom' | 'center',
        width: args.position.width,
        height: args.position.height
      } : undefined
    });

    return success({
      status: 'created',
      outputPath: args.outputPath
    });
  } catch (err) {
    return error(`Failed to create PiP composite: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: capture_scroll
export async function captureScroll(args: {
  imagePath: string;
  outputPath: string;
  scrollSpeed?: number;
  duration?: number;
}): Promise<ToolResult> {
  try {
    await createScrollingVideo(args.imagePath, args.outputPath, {
      scrollSpeed: args.scrollSpeed,
      duration: args.duration
    });

    return success({
      status: 'captured',
      outputPath: args.outputPath
    });
  } catch (err) {
    return error(`Failed to capture scroll: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: encode_video
export async function encodeVideo(args: {
  inputPath: string;
  outputPath: string;
  preset?: 'fast' | 'balanced' | 'quality';
  codec?: string;
}): Promise<ToolResult> {
  try {
    await videoOrchestrator.encodeVideo(args.inputPath, args.outputPath, {
      preset: args.preset,
      codec: args.codec
    });

    return success({
      status: 'encoded',
      outputPath: args.outputPath
    });
  } catch (err) {
    return error(`Failed to encode video: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: preview_video
export async function previewVideo(args: {
  inputPath: string;
  outputPath: string;
  duration?: number;
}): Promise<ToolResult> {
  try {
    await videoOrchestrator.generatePreview(args.inputPath, args.outputPath, args.duration);

    return success({
      status: 'generated',
      outputPath: args.outputPath,
      duration: args.duration || 10
    });
  } catch (err) {
    return error(`Failed to generate preview: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: get_video_status
export async function getVideoStatus(args: { jobId: string }): Promise<ToolResult> {
  try {
    const job = videoOrchestrator.getJob(args.jobId);

    if (!job) {
      return error(`Job not found: ${args.jobId}`);
    }

    return success({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      outputPath: job.outputPath,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt
    });
  } catch (err) {
    return error(`Failed to get video status: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: cancel_video_job
export async function cancelVideoJob(args: { jobId: string }): Promise<ToolResult> {
  try {
    const cancelled = videoOrchestrator.cancelJob(args.jobId);

    return success({
      jobId: args.jobId,
      cancelled,
      message: cancelled ? 'Job cancelled' : 'Job not found or already completed'
    });
  } catch (err) {
    return error(`Failed to cancel job: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: get_video_assets
export async function getVideoAssets(): Promise<ToolResult> {
  try {
    const assets = await videoOrchestrator.listAssets();

    return success({
      count: assets.length,
      assets,
      directories: VIDEO_DIRS
    });
  } catch (err) {
    return error(`Failed to get video assets: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: cleanup_video_temp
export async function cleanupVideoTemp(args: { olderThanHours?: number }): Promise<ToolResult> {
  try {
    const deleted = await videoOrchestrator.cleanupOldVideos(args.olderThanHours);

    return success({
      status: 'cleaned',
      deleted,
      olderThanHours: args.olderThanHours || 24
    });
  } catch (err) {
    return error(`Failed to cleanup: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Export tool definitions
export const videoToolDefinitions = [
  {
    name: 'build_video_background',
    description: 'Generate video background for a script',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Script ID' },
        duration: { type: 'number', description: 'Duration in seconds' },
        resolution: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' }
          }
        }
      },
      required: ['scriptId']
    }
  },
  {
    name: 'composite_final_video',
    description: 'Composite final video from background and foreground',
    inputSchema: {
      type: 'object',
      properties: {
        backgroundPath: { type: 'string', description: 'Path to background video' },
        foregroundPath: { type: 'string', description: 'Path to foreground video' },
        outputPath: { type: 'string', description: 'Output path' },
        chromaKey: { type: 'boolean', description: 'Apply chroma key' }
      },
      required: ['backgroundPath', 'outputPath']
    }
  },
  {
    name: 'export_all_platforms',
    description: 'Export video to multiple social media platforms',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: 'Input video path' },
        platforms: { type: 'array', items: { type: 'string' }, description: 'Target platforms (youtube, tiktok, instagram, twitter)' },
        quality: { type: 'string', enum: ['fast', 'balanced', 'quality'] }
      },
      required: ['inputPath', 'platforms']
    }
  },
  {
    name: 'run_video_pipeline',
    description: 'Run full video pipeline for a script',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Script ID' },
        platforms: { type: 'array', items: { type: 'string' } },
        chromaKeySource: { type: 'string', description: 'Chroma key video source' },
        motionGraphics: { type: 'object' }
      },
      required: ['scriptId', 'platforms']
    }
  },
  {
    name: 'apply_chroma_key',
    description: 'Apply green screen chroma key effect',
    inputSchema: {
      type: 'object',
      properties: {
        foregroundPath: { type: 'string' },
        backgroundPath: { type: 'string' },
        outputPath: { type: 'string' },
        keyColor: { type: 'string', enum: ['green', 'blue', 'magenta'] },
        similarity: { type: 'number' }
      },
      required: ['foregroundPath', 'backgroundPath', 'outputPath']
    }
  },
  {
    name: 'add_motion_graphics',
    description: 'Add motion graphics overlay to video',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string' },
        outputPath: { type: 'string' },
        template: { type: 'string', enum: ['lower_third', 'title_card', 'news_ticker'] },
        text: { type: 'string' },
        startTime: { type: 'number' },
        duration: { type: 'number' }
      },
      required: ['inputPath', 'outputPath', 'template']
    }
  },
  {
    name: 'create_pip_composite',
    description: 'Create picture-in-picture composite',
    inputSchema: {
      type: 'object',
      properties: {
        mainVideoPath: { type: 'string' },
        pipVideoPath: { type: 'string' },
        outputPath: { type: 'string' },
        position: { type: 'object' }
      },
      required: ['mainVideoPath', 'pipVideoPath', 'outputPath']
    }
  },
  {
    name: 'capture_scroll',
    description: 'Create scrolling video from tall image',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: { type: 'string' },
        outputPath: { type: 'string' },
        scrollSpeed: { type: 'number' },
        duration: { type: 'number' }
      },
      required: ['imagePath', 'outputPath']
    }
  },
  {
    name: 'encode_video',
    description: 'Encode video with specified settings',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string' },
        outputPath: { type: 'string' },
        preset: { type: 'string', enum: ['fast', 'balanced', 'quality'] },
        codec: { type: 'string' }
      },
      required: ['inputPath', 'outputPath']
    }
  },
  {
    name: 'preview_video',
    description: 'Generate preview clip from video',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string' },
        outputPath: { type: 'string' },
        duration: { type: 'number', description: 'Preview duration in seconds' }
      },
      required: ['inputPath', 'outputPath']
    }
  },
  {
    name: 'get_video_status',
    description: 'Get status of video processing job',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' }
      },
      required: ['jobId']
    }
  },
  {
    name: 'cancel_video_job',
    description: 'Cancel video processing job',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' }
      },
      required: ['jobId']
    }
  },
  {
    name: 'get_video_assets',
    description: 'List available video assets',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'cleanup_video_temp',
    description: 'Clean up temporary video files',
    inputSchema: {
      type: 'object',
      properties: {
        olderThanHours: { type: 'number', description: 'Delete files older than N hours' }
      }
    }
  }
];

export const videoToolHandlers: Record<string, (args: unknown) => Promise<ToolResult>> = {
  build_video_background: (args) => buildVideoBackground(args as { scriptId: string; duration?: number; resolution?: { width: number; height: number } }),
  composite_final_video: (args) => compositeFinalVideo(args as { backgroundPath: string; foregroundPath?: string; outputPath: string; chromaKey?: boolean }),
  export_all_platforms: (args) => exportAllPlatforms(args as { inputPath: string; platforms: string[]; quality?: 'fast' | 'balanced' | 'quality' }),
  run_video_pipeline: (args) => runVideoPipeline(args as { scriptId: string; platforms: string[]; chromaKeySource?: string; motionGraphics?: { template: string; text?: string } }),
  apply_chroma_key: (args) => applyChromaKeyTool(args as { foregroundPath: string; backgroundPath: string; outputPath: string; keyColor?: 'green' | 'blue' | 'magenta'; similarity?: number }),
  add_motion_graphics: (args) => addMotionGraphicsTool(args as { inputPath: string; outputPath: string; template: string; text?: string; startTime?: number; duration?: number }),
  create_pip_composite: (args) => createPipCompositeTool(args as { mainVideoPath: string; pipVideoPath: string; outputPath: string; position?: { x: string; y: string; width: string; height: string } }),
  capture_scroll: (args) => captureScroll(args as { imagePath: string; outputPath: string; scrollSpeed?: number; duration?: number }),
  encode_video: (args) => encodeVideo(args as { inputPath: string; outputPath: string; preset?: 'fast' | 'balanced' | 'quality'; codec?: string }),
  preview_video: (args) => previewVideo(args as { inputPath: string; outputPath: string; duration?: number }),
  get_video_status: (args) => getVideoStatus(args as { jobId: string }),
  cancel_video_job: (args) => cancelVideoJob(args as { jobId: string }),
  get_video_assets: () => getVideoAssets(),
  cleanup_video_temp: (args) => cleanupVideoTemp(args as { olderThanHours?: number })
};
