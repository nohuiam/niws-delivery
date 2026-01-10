/**
 * HTTP Server
 *
 * REST API for niws-production server.
 * Port: 8035
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { getScriptDatabase } from '../database/scriptDatabase.js';
import { getBriefDatabase, type BriefStatus } from '../database/briefDatabase.js';
import { scriptGenerator } from '../services/scriptGenerator.js';
import { christOhMeter } from '../services/christOhMeter.js';
import { checkAllServices } from '../services/clients.js';
import {
  validate,
  generateScriptSchema,
  updateScriptSchema,
  exportScriptSchema,
  createBriefSchema,
  updateBriefStatusSchema,
  rateActionSchema,
} from '../validation/schemas.js';

const DEFAULT_HTTP_PORT = 8035;

interface RouteHandler {
  (req: IncomingMessage, res: ServerResponse, body: string, params?: Record<string, string>): Promise<void>;
}

interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
}

export class HttpServer {
  private server: ReturnType<typeof createServer> | null = null;
  private routes: Route[] = [];
  private port: number;

  constructor(port?: number) {
    // Allow port override, then check env, then use default
    this.port = port ?? parseInt(process.env.HTTP_PORT || String(DEFAULT_HTTP_PORT), 10);
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health & Status
    this.addRoute('GET', /^\/api\/health$/, this.handleHealth.bind(this));
    this.addRoute('GET', /^\/api\/status$/, this.handleStatus.bind(this));

    // Scripts
    this.addRoute('GET', /^\/api\/scripts$/, this.handleListScripts.bind(this));
    this.addRoute('GET', /^\/api\/scripts\/([^/]+)$/, this.handleGetScript.bind(this));
    this.addRoute('POST', /^\/api\/scripts$/, this.handleCreateScript.bind(this));
    this.addRoute('PUT', /^\/api\/scripts\/([^/]+)$/, this.handleUpdateScript.bind(this));
    this.addRoute('DELETE', /^\/api\/scripts\/([^/]+)$/, this.handleDeleteScript.bind(this));
    this.addRoute('POST', /^\/api\/scripts\/([^/]+)\/validate$/, this.handleValidateScript.bind(this));
    this.addRoute('POST', /^\/api\/scripts\/([^/]+)\/export$/, this.handleExportScript.bind(this));

    // Briefs
    this.addRoute('GET', /^\/api\/briefs$/, this.handleListBriefs.bind(this));
    this.addRoute('GET', /^\/api\/briefs\/([^/]+)$/, this.handleGetBrief.bind(this));
    this.addRoute('POST', /^\/api\/briefs$/, this.handleCreateBrief.bind(this));
    this.addRoute('PUT', /^\/api\/briefs\/([^/]+)\/status$/, this.handleUpdateBriefStatus.bind(this));

    // Christ-Oh-Meter
    this.addRoute('POST', /^\/api\/christ-oh-meter\/rate$/, this.handleRateAction.bind(this));
    this.addRoute('GET', /^\/api\/christ-oh-meter\/ratings\/([^/]+)$/, this.handleGetRatings.bind(this));

    // Stats
    this.addRoute('GET', /^\/api\/stats\/scripts$/, this.handleScriptStats.bind(this));
    this.addRoute('GET', /^\/api\/stats\/briefs$/, this.handleBriefStats.bind(this));
  }

  private addRoute(method: string, pattern: RegExp, handler: RouteHandler): void {
    this.routes.push({ method, pattern, handler });
  }

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Parse body
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }

      // Find matching route
      const url = new URL(req.url || '/', `http://localhost:${this.port}`);
      const pathname = url.pathname;

      for (const route of this.routes) {
        if (route.method === req.method) {
          const match = pathname.match(route.pattern);
          if (match) {
            const params: Record<string, string> = {};
            if (match.length > 1) {
              params.id = match[1];
            }

            try {
              await route.handler(req, res, body, params);
              return;
            } catch (error) {
              console.error('[HTTP] Handler error:', error);
              this.sendJson(res, 500, { error: 'Internal server error' });
              return;
            }
          }
        }
      }

      // Not found
      this.sendJson(res, 404, { error: 'Not found' });
    });

    return new Promise((resolve) => {
      this.server!.listen(this.port, () => {
        console.log(`[HTTP] Server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private parseJson(body: string): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
    try {
      return { success: true, data: body ? JSON.parse(body) : {} };
    } catch {
      return { success: false, error: 'Invalid JSON in request body' };
    }
  }

  // --- Health & Status ---

  private async handleHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.sendJson(res, 200, { status: 'ok', server: 'niws-production', port: this.port });
  }

  private async handleStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const services = await checkAllServices();
    const scriptDb = getScriptDatabase();
    const briefDb = getBriefDatabase();

    this.sendJson(res, 200, {
      server: 'niws-production',
      uptime: process.uptime(),
      ports: {
        http: this.port,
        udp: 3035,
        ws: 9035,
      },
      dependencies: services,
      databases: {
        scripts: scriptDb.getStats(),
        briefs: briefDb.getStats(),
      },
    });
  }

  // --- Scripts ---

  private async handleListScripts(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const storyId = url.searchParams.get('story_id') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const result = scriptGenerator.listScripts({ storyId, status, limit, offset });
    this.sendJson(res, 200, result);
  }

  private async handleGetScript(_req: IncomingMessage, res: ServerResponse, _body: string, params?: Record<string, string>): Promise<void> {
    const script = scriptGenerator.getScript(params?.id || '');
    if (!script) {
      this.sendJson(res, 404, { error: 'Script not found' });
      return;
    }
    this.sendJson(res, 200, { script });
  }

  private async handleCreateScript(_req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
    const parsed = this.parseJson(body);
    if (!parsed.success) {
      this.sendJson(res, 400, { error: parsed.error });
      return;
    }

    const validation = validate(generateScriptSchema, parsed.data);
    if (!validation.success) {
      this.sendJson(res, 400, { error: validation.error });
      return;
    }
    const data = validation.data!;

    try {
      const result = await scriptGenerator.generateScript({
        storyId: data.story_id,
        storyTopic: data.story_topic,
        briefId: data.brief_id,
        preferences: {
          targetDurationSeconds: data.target_duration_seconds,
          outletSelection: data.outlet_selection,
          emphasis: data.emphasis,
        },
      });

      this.sendJson(res, 201, {
        script_id: result.script.id,
        title: result.script.title,
        word_count: result.script.wordCount,
        qa: result.qa,
      });
    } catch (error) {
      console.error('[HTTP] createScript failed:', error);
      this.sendJson(res, 500, { error: error instanceof Error ? error.message : 'Script generation failed' });
    }
  }

  private async handleUpdateScript(_req: IncomingMessage, res: ServerResponse, body: string, params?: Record<string, string>): Promise<void> {
    const parsed = this.parseJson(body);
    if (!parsed.success) {
      this.sendJson(res, 400, { error: parsed.error });
      return;
    }

    const validation = validate(updateScriptSchema, { ...parsed.data, script_id: params?.id });
    if (!validation.success) {
      this.sendJson(res, 400, { error: validation.error });
      return;
    }
    const data = validation.data!;

    if (!data.status) {
      this.sendJson(res, 400, { error: 'Missing required field: status' });
      return;
    }

    const result = scriptGenerator.updateStatus(data.script_id, data.status);
    if (!result) {
      this.sendJson(res, 404, { error: 'Script not found' });
      return;
    }
    this.sendJson(res, 200, { success: true, script_id: data.script_id });
  }

  private async handleDeleteScript(_req: IncomingMessage, res: ServerResponse, _body: string, params?: Record<string, string>): Promise<void> {
    const db = getScriptDatabase();
    const success = db.deleteScript(params?.id || '');
    if (!success) {
      this.sendJson(res, 404, { error: 'Script not found' });
      return;
    }
    this.sendJson(res, 200, { success: true });
  }

  private async handleValidateScript(_req: IncomingMessage, res: ServerResponse, _body: string, params?: Record<string, string>): Promise<void> {
    const script = scriptGenerator.getScript(params?.id || '');
    if (!script) {
      this.sendJson(res, 404, { error: 'Script not found' });
      return;
    }
    const qa = scriptGenerator.validateScript(script);
    this.sendJson(res, 200, { script_id: params?.id, qa });
  }

  private async handleExportScript(_req: IncomingMessage, res: ServerResponse, body: string, params?: Record<string, string>): Promise<void> {
    const parsed = this.parseJson(body);
    if (!parsed.success) {
      this.sendJson(res, 400, { error: parsed.error });
      return;
    }

    const validation = validate(exportScriptSchema, { ...parsed.data, script_id: params?.id });
    if (!validation.success) {
      this.sendJson(res, 400, { error: validation.error });
      return;
    }
    const data = validation.data!;

    const result = scriptGenerator.exportScript(data.script_id, data.format);
    if (!result) {
      this.sendJson(res, 404, { error: 'Script not found' });
      return;
    }
    this.sendJson(res, 200, result);
  }

  // --- Briefs ---

  private async handleListBriefs(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const storyId = url.searchParams.get('story_id') || undefined;
    const statusParam = url.searchParams.get('status');
    const validStatuses: BriefStatus[] = ['draft', 'reviewed', 'approved', 'used'];
    const status: BriefStatus | undefined = statusParam && validStatuses.includes(statusParam as BriefStatus)
      ? statusParam as BriefStatus
      : undefined;
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const db = getBriefDatabase();
    const result = db.listBriefs({ storyId, status, limit });
    this.sendJson(res, 200, result);
  }

  private async handleGetBrief(_req: IncomingMessage, res: ServerResponse, _body: string, params?: Record<string, string>): Promise<void> {
    const db = getBriefDatabase();
    const brief = db.getBrief(params?.id || '');
    if (!brief) {
      this.sendJson(res, 404, { error: 'Brief not found' });
      return;
    }

    const quotes = db.getQuotes(brief.id);
    const legislation = db.getLegislationForBrief(brief.id);
    const ratings = db.getRatingsForBrief(brief.id);

    this.sendJson(res, 200, { brief, quotes, legislation, ratings });
  }

  private async handleCreateBrief(_req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
    const parsed = this.parseJson(body);
    if (!parsed.success) {
      this.sendJson(res, 400, { error: parsed.error });
      return;
    }

    const validation = validate(createBriefSchema, parsed.data);
    if (!validation.success) {
      this.sendJson(res, 400, { error: validation.error });
      return;
    }
    const data = validation.data!;

    const db = getBriefDatabase();
    const brief = db.createBrief({
      storyId: data.story_id,
      title: data.title,
      summary: data.summary || '',
      keyFacts: data.key_facts || [],
      perspectives: [],
      christOhMeterScore: 0,
      moralAlignment: '',
    });

    this.sendJson(res, 201, { brief_id: brief.id, title: brief.title });
  }

  private async handleUpdateBriefStatus(_req: IncomingMessage, res: ServerResponse, body: string, params?: Record<string, string>): Promise<void> {
    const parsed = this.parseJson(body);
    if (!parsed.success) {
      this.sendJson(res, 400, { error: parsed.error });
      return;
    }

    const validation = validate(updateBriefStatusSchema, { ...parsed.data, brief_id: params?.id });
    if (!validation.success) {
      this.sendJson(res, 400, { error: validation.error });
      return;
    }
    const data = validation.data!;

    const db = getBriefDatabase();
    const success = db.updateBriefStatus(data.brief_id, data.status);
    if (!success) {
      this.sendJson(res, 404, { error: 'Brief not found' });
      return;
    }
    this.sendJson(res, 200, { success: true, brief_id: data.brief_id, status: data.status });
  }

  // --- Christ-Oh-Meter ---

  private async handleRateAction(_req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
    const parsed = this.parseJson(body);
    if (!parsed.success) {
      this.sendJson(res, 400, { error: parsed.error });
      return;
    }

    const validation = validate(rateActionSchema, parsed.data);
    if (!validation.success) {
      this.sendJson(res, 400, { error: validation.error });
      return;
    }
    const data = validation.data!;

    try {
      const rating = await christOhMeter.rateAction(
        data.action,
        data.subject,
        data.affected,
        data.context
      );

      const db = getBriefDatabase();
      const ratingId = db.saveRating(rating, data.brief_id);

      this.sendJson(res, 200, {
        rating_id: ratingId,
        spectrum_score: rating.spectrumScore,
        verdict: rating.verdict,
        strongest_christ_tenets: rating.strongestChristTenets,
        strongest_evil_tenets: rating.strongestEvilTenets,
        reasoning: rating.reasoning,
      });
    } catch (error) {
      console.error('[HTTP] rateAction failed:', error);
      this.sendJson(res, 500, { error: error instanceof Error ? error.message : 'Rating failed' });
    }
  }

  private async handleGetRatings(_req: IncomingMessage, res: ServerResponse, _body: string, params?: Record<string, string>): Promise<void> {
    const db = getBriefDatabase();
    const ratings = db.getRatingsForBrief(params?.id || '');
    this.sendJson(res, 200, { ratings });
  }

  // --- Stats ---

  private async handleScriptStats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const stats = scriptGenerator.getStats();
    this.sendJson(res, 200, { stats });
  }

  private async handleBriefStats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const db = getBriefDatabase();
    const stats = db.getStats();
    this.sendJson(res, 200, { stats });
  }
}

export const httpServer = new HttpServer();
