// Tumbler - InterLock whitelist filter for allowed signals

export interface TumblerConfig {
  allowedSignals: string[];
  blockedSignals: string[];
  allowAll: boolean;
}

const DEFAULT_CONFIG: TumblerConfig = {
  allowedSignals: ['*'],
  blockedSignals: [],
  allowAll: true
};

class Tumbler {
  private config: TumblerConfig;

  constructor(config?: Partial<TumblerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // If allowedSignals includes '*', allow all
    this.config.allowAll = this.config.allowedSignals.includes('*');
  }

  /**
   * Check if a signal is allowed through the tumbler
   */
  isAllowed(signalName: string): boolean {
    // Check blocked list first
    if (this.config.blockedSignals.includes(signalName)) {
      return false;
    }

    // If allow all, pass through
    if (this.config.allowAll) {
      return true;
    }

    // Check allowed list
    return this.config.allowedSignals.includes(signalName);
  }

  /**
   * Add a signal to the allowed list
   */
  allow(signalName: string): void {
    if (!this.config.allowedSignals.includes(signalName)) {
      this.config.allowedSignals.push(signalName);
    }
    // Remove from blocked if present
    const blockedIndex = this.config.blockedSignals.indexOf(signalName);
    if (blockedIndex >= 0) {
      this.config.blockedSignals.splice(blockedIndex, 1);
    }
  }

  /**
   * Add a signal to the blocked list
   */
  block(signalName: string): void {
    if (!this.config.blockedSignals.includes(signalName)) {
      this.config.blockedSignals.push(signalName);
    }
    // Remove from allowed if present
    const allowedIndex = this.config.allowedSignals.indexOf(signalName);
    if (allowedIndex >= 0) {
      this.config.allowedSignals.splice(allowedIndex, 1);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): TumblerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TumblerConfig>): void {
    this.config = { ...this.config, ...config };
    this.config.allowAll = this.config.allowedSignals.includes('*');
  }
}

export const tumbler = new Tumbler();
export { Tumbler };
