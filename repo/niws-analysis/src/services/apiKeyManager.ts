/**
 * API Key Manager
 *
 * Manages Anthropic API key with support for runtime rotation via:
 * 1. SIGHUP signal to reload from environment
 * 2. Config file watching (config/api-keys.json)
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logging/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'api-keys.json');

interface ApiKeyConfig {
  anthropic_api_key?: string;
}

export class ApiKeyManager extends EventEmitter {
  private currentKey: string | null = null;
  private keySource: 'env' | 'file' | 'none' = 'none';
  private fileWatcher: fs.FSWatcher | null = null;
  private sighupHandler: (() => void) | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.loadKey();
    this.setupWatchers();
  }

  /**
   * Load API key from config file or environment
   */
  private loadKey(): void {
    // Try config file first
    const fileKey = this.loadFromFile();
    if (fileKey) {
      this.currentKey = fileKey;
      this.keySource = 'file';
      logger.info('API key loaded from config file');
      return;
    }

    // Fall back to environment variable
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) {
      this.currentKey = envKey;
      this.keySource = 'env';
      logger.info('API key loaded from environment');
      return;
    }

    this.currentKey = null;
    this.keySource = 'none';
    logger.warn('No API key configured - analysis will use mock responses');
  }

  /**
   * Load API key from config file
   */
  private loadFromFile(): string | null {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        return null;
      }

      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const config: ApiKeyConfig = JSON.parse(content);

      if (config.anthropic_api_key && typeof config.anthropic_api_key === 'string') {
        return config.anthropic_api_key;
      }

      return null;
    } catch (error) {
      logger.error('Failed to load API key from config file', { error, path: CONFIG_PATH });
      return null;
    }
  }

  /**
   * Set up watchers for key rotation
   */
  private setupWatchers(): void {
    // Watch for SIGHUP to reload from environment
    this.sighupHandler = () => {
      logger.info('Received SIGHUP - reloading API key');
      const oldKey = this.currentKey;
      this.loadKey();

      if (oldKey !== this.currentKey) {
        logger.info('API key changed', { source: this.keySource });
        this.emit('keyChanged', this.currentKey);
      } else {
        logger.info('API key unchanged after reload');
      }
    };
    process.on('SIGHUP', this.sighupHandler);

    // Watch config file if directory exists
    const configDir = path.dirname(CONFIG_PATH);
    if (fs.existsSync(configDir)) {
      this.setupFileWatcher();
    }
  }

  /**
   * Set up file watcher for config file
   */
  private setupFileWatcher(): void {
    try {
      // Watch the config directory for changes to api-keys.json
      const configDir = path.dirname(CONFIG_PATH);
      const configFile = path.basename(CONFIG_PATH);

      this.fileWatcher = fs.watch(configDir, (eventType, filename) => {
        if (filename === configFile) {
          logger.info('Config file changed - reloading API key');

          // Debounce: clear any pending timer and set a new one
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
          }
          this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            const oldKey = this.currentKey;
            this.loadKey();

            if (oldKey !== this.currentKey) {
              logger.info('API key changed from file update', { source: this.keySource });
              this.emit('keyChanged', this.currentKey);
            }
          }, 100);
        }
      });

      logger.debug('File watcher set up for API key config');
    } catch (error) {
      logger.warn('Failed to set up config file watcher', { error });
    }
  }

  /**
   * Get current API key
   */
  getKey(): string | null {
    return this.currentKey;
  }

  /**
   * Get key source
   */
  getKeySource(): 'env' | 'file' | 'none' {
    return this.keySource;
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return this.currentKey !== null;
  }

  /**
   * Validate API key format (basic check)
   */
  isKeyFormatValid(): boolean {
    if (!this.currentKey) return false;
    return this.currentKey.startsWith('sk-ant-');
  }

  /**
   * Stop watching for changes and clean up all resources
   */
  stop(): void {
    // Remove SIGHUP handler
    if (this.sighupHandler) {
      process.removeListener('SIGHUP', this.sighupHandler);
      this.sighupHandler = null;
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close file watcher
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    // Remove all event listeners
    this.removeAllListeners();
  }
}

// Singleton instance
let keyManager: ApiKeyManager | null = null;

export function getApiKeyManager(): ApiKeyManager {
  if (!keyManager) {
    keyManager = new ApiKeyManager();
  }
  return keyManager;
}
