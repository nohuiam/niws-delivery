/**
 * Singleton Pattern Tests
 *
 * Verifies that database singletons work correctly and prevent
 * accidental reinitialization with different paths.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getScriptDatabase,
  resetScriptDatabaseInstance,
  ScriptDatabase,
} from '../src/database/scriptDatabase.js';
import {
  getBriefDatabase,
  resetBriefDatabaseInstance,
  BriefDatabase,
} from '../src/database/briefDatabase.js';

describe('ScriptDatabase Singleton', () => {
  beforeEach(() => {
    resetScriptDatabaseInstance();
  });

  afterEach(() => {
    resetScriptDatabaseInstance();
  });

  it('should return same instance when called multiple times', () => {
    const instance1 = getScriptDatabase(':memory:');
    const instance2 = getScriptDatabase(':memory:');
    expect(instance1).toBe(instance2);
  });

  it('should allow different paths when using :memory: (special test case)', () => {
    // :memory: is a special case that allows different paths for testing
    const instance1 = getScriptDatabase(':memory:');
    const instance2 = getScriptDatabase('./different/path.sqlite');

    // Same instance should be returned (no reinitialization)
    expect(instance1).toBe(instance2);
  });

  it('should allow same path to be used again', () => {
    const instance1 = getScriptDatabase(':memory:');
    const instance2 = getScriptDatabase(':memory:');
    expect(instance1).toBe(instance2);
  });

  it('should reset properly', () => {
    const instance1 = getScriptDatabase(':memory:');
    resetScriptDatabaseInstance();

    // After reset, we can create new instance with different path
    const instance2 = getScriptDatabase(':memory:');
    expect(instance1).not.toBe(instance2);
  });

  it('should be a valid ScriptDatabase instance', () => {
    const db = getScriptDatabase(':memory:');
    expect(db).toBeInstanceOf(ScriptDatabase);
    expect(db.getStats).toBeDefined();
    expect(typeof db.getStats().totalScripts).toBe('number');
  });
});

describe('BriefDatabase Singleton', () => {
  beforeEach(() => {
    resetBriefDatabaseInstance();
  });

  afterEach(() => {
    resetBriefDatabaseInstance();
  });

  it('should return same instance when called multiple times', () => {
    const instance1 = getBriefDatabase(':memory:');
    const instance2 = getBriefDatabase(':memory:');
    expect(instance1).toBe(instance2);
  });

  it('should allow different paths when using :memory: (special test case)', () => {
    // :memory: is a special case that allows different paths for testing
    const instance1 = getBriefDatabase(':memory:');
    const instance2 = getBriefDatabase('./different/path.sqlite');

    // Same instance should be returned (no reinitialization)
    expect(instance1).toBe(instance2);
  });

  it('should allow same path to be used again', () => {
    const instance1 = getBriefDatabase(':memory:');
    const instance2 = getBriefDatabase(':memory:');
    expect(instance1).toBe(instance2);
  });

  it('should reset properly', () => {
    const instance1 = getBriefDatabase(':memory:');
    resetBriefDatabaseInstance();

    // After reset, we can create new instance with different path
    const instance2 = getBriefDatabase(':memory:');
    expect(instance1).not.toBe(instance2);
  });

  it('should be a valid BriefDatabase instance', () => {
    const db = getBriefDatabase(':memory:');
    expect(db).toBeInstanceOf(BriefDatabase);
    expect(db.getStats).toBeDefined();
    expect(typeof db.getStats().totalBriefs).toBe('number');
  });
});

describe('Cross-Database Independence', () => {
  beforeEach(() => {
    resetScriptDatabaseInstance();
    resetBriefDatabaseInstance();
  });

  afterEach(() => {
    resetScriptDatabaseInstance();
    resetBriefDatabaseInstance();
  });

  it('should maintain separate singleton instances', () => {
    const scriptDb = getScriptDatabase(':memory:');
    const briefDb = getBriefDatabase(':memory:');

    expect(scriptDb).not.toBe(briefDb);
  });

  it('should have independent operation counts', () => {
    const scriptDb = getScriptDatabase(':memory:');
    const briefDb = getBriefDatabase(':memory:');

    // Create a script
    scriptDb.createScript({
      storyId: 'story_123',
      briefId: null,
      title: 'Test Script',
      status: 'draft',
      content: 'Content',
      sections: [],
      wordCount: 1,
      estimatedDurationSeconds: 1,
    });

    // Script count should increase, brief count should stay at 0
    expect(scriptDb.getStats().totalScripts).toBe(1);
    expect(briefDb.getStats().totalBriefs).toBe(0);

    // Create a brief
    briefDb.createBrief({
      storyId: 'story_123',
      title: 'Test Brief',
      summary: 'Summary',
      keyFacts: [],
      perspectives: [],
      christOhMeterScore: 0,
      moralAlignment: '',
    });

    // Both counts should now show 1
    expect(scriptDb.getStats().totalScripts).toBe(1);
    expect(briefDb.getStats().totalBriefs).toBe(1);
  });
});
