/**
 * InterLock Tumbler - Signal Whitelist Filter
 *
 * Filters incoming signals based on configured whitelist.
 */

export interface TumblerConfig {
  allowedSignals: string[];
  allowAll?: boolean;
}

export class Tumbler {
  private allowedSignals: Set<string>;
  private allowAll: boolean;

  constructor(config: TumblerConfig) {
    this.allowedSignals = new Set(config.allowedSignals);
    this.allowAll = config.allowAll || false;
  }

  /**
   * Check if a signal type is allowed
   */
  isAllowed(signalType: string): boolean {
    if (this.allowAll) {
      return true;
    }

    // Check for wildcard
    if (this.allowedSignals.has('*')) {
      return true;
    }

    // Check exact match
    if (this.allowedSignals.has(signalType)) {
      return true;
    }

    // Check namespace wildcard (e.g., "analysis:*" matches "analysis:complete")
    const namespace = signalType.split(':')[0];
    if (this.allowedSignals.has(`${namespace}:*`)) {
      return true;
    }

    return false;
  }

  /**
   * Add a signal type to the whitelist
   */
  allow(signalType: string): void {
    this.allowedSignals.add(signalType);
  }

  /**
   * Remove a signal type from the whitelist
   */
  deny(signalType: string): void {
    this.allowedSignals.delete(signalType);
  }

  /**
   * Get all allowed signal types
   */
  getAllowed(): string[] {
    return Array.from(this.allowedSignals);
  }
}
