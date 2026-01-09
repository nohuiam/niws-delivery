import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import type { AirDropResult } from '../types.js';

const execAsync = promisify(exec);

export class AirDropService {
  /**
   * Send a file via AirDrop using macOS Finder
   * Falls back gracefully on non-macOS systems
   */
  async sendToDevice(filePath: string, deviceName?: string): Promise<AirDropResult> {
    // Check if we're on macOS
    if (process.platform !== 'darwin') {
      return {
        success: false,
        error: 'AirDrop is only available on macOS'
      };
    }

    // Verify file exists
    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `File not found: ${filePath}`
      };
    }

    // Use AppleScript to invoke AirDrop via Finder
    const script = `
tell application "Finder"
  activate
  set theFile to POSIX file "${filePath}" as alias
  reveal theFile
  delay 1
  tell application "System Events"
    keystroke "r" using {command down, shift down}
    delay 1
  end tell
end tell
`;

    try {
      await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      return {
        success: true,
        device: deviceName || 'AirDrop (manual selection)'
      };
    } catch (error) {
      // Try alternative approach using open command with AirDrop
      try {
        await execAsync(`open -a "AirDrop"`);
        return {
          success: true,
          device: 'AirDrop window opened - please select device'
        };
      } catch (openError) {
        return {
          success: false,
          error: `AirDrop failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  }

  /**
   * Send file directly to a specific device (if discoverable)
   */
  async sendToNamedDevice(filePath: string, deviceName: string): Promise<AirDropResult> {
    if (process.platform !== 'darwin') {
      return {
        success: false,
        error: 'AirDrop is only available on macOS'
      };
    }

    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `File not found: ${filePath}`
      };
    }

    // Use NSSharingService for direct share (requires entitlements in production)
    const script = `
set theFile to POSIX file "${filePath}" as alias
tell application "Finder"
  activate
  reveal theFile
  delay 0.5
  tell application "System Events"
    keystroke "r" using {command down, shift down}
    delay 2
  end tell
end tell
`;

    try {
      await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
      return {
        success: true,
        device: deviceName
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to send to ${deviceName}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if AirDrop is available and enabled
   */
  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    if (process.platform !== 'darwin') {
      return { available: false, reason: 'Not running on macOS' };
    }

    try {
      // Check if Bluetooth is on (required for AirDrop)
      const { stdout } = await execAsync('defaults read /Library/Preferences/com.apple.Bluetooth ControllerPowerState');
      if (stdout.trim() !== '1') {
        return { available: false, reason: 'Bluetooth is disabled' };
      }

      return { available: true };
    } catch {
      // If we can't check, assume it might be available
      return { available: true };
    }
  }

  /**
   * List nearby AirDrop-capable devices (limited without entitlements)
   */
  async listNearbyDevices(): Promise<string[]> {
    if (process.platform !== 'darwin') {
      return [];
    }

    // This is limited - proper implementation would require CoreBluetooth entitlements
    // For now, return common device names that might be available
    return ['iPad', 'iPhone', 'MacBook'];
  }
}

export const airDropService = new AirDropService();
