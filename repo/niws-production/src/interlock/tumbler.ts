/**
 * InterLock Tumbler - Whitelist filtering for signals
 *
 * Controls which signals are accepted and from which peers.
 */

export interface TumblerConfig {
  acceptAll?: boolean;
  acceptedSignals?: string[];
  acceptedPeers?: string[];
}

export class Tumbler {
  private acceptAll: boolean;
  private acceptedSignals: Set<string>;
  private acceptedPeers: Set<string>;

  constructor(config: TumblerConfig = {}) {
    this.acceptAll = config.acceptAll ?? false;
    this.acceptedSignals = new Set(config.acceptedSignals || ['*']);
    this.acceptedPeers = new Set(config.acceptedPeers || []);
  }

  /**
   * Check if a signal should be accepted
   */
  shouldAccept(signalName: string, peerAddress?: string): boolean {
    // Accept all mode
    if (this.acceptAll) return true;

    // Check signal whitelist
    if (!this.acceptedSignals.has('*') && !this.acceptedSignals.has(signalName)) {
      return false;
    }

    // Check peer whitelist (if configured)
    // If a peer whitelist exists, require a valid peer address
    if (this.acceptedPeers.size > 0) {
      if (!peerAddress || !this.acceptedPeers.has(peerAddress)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Add a signal to the whitelist
   */
  addSignal(signalName: string): void {
    this.acceptedSignals.add(signalName);
  }

  /**
   * Remove a signal from the whitelist
   */
  removeSignal(signalName: string): void {
    this.acceptedSignals.delete(signalName);
  }

  /**
   * Add a peer to the whitelist
   */
  addPeer(peerAddress: string): void {
    this.acceptedPeers.add(peerAddress);
  }

  /**
   * Remove a peer from the whitelist
   */
  removePeer(peerAddress: string): void {
    this.acceptedPeers.delete(peerAddress);
  }

  /**
   * Get accepted signals
   */
  getAcceptedSignals(): string[] {
    return Array.from(this.acceptedSignals);
  }

  /**
   * Get accepted peers
   */
  getAcceptedPeers(): string[] {
    return Array.from(this.acceptedPeers);
  }
}
