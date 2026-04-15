/**
 * Bundle Verification Script
 *
 * Verifies that the built package can be imported and used correctly.
 * This script imports from the dist folder and runs basic smoke tests.
 *
 * Run with: node scripts/verify-bundle.mjs
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const require = createRequire(import.meta.url);

console.log('🔍 Verifying featurefly bundle...\n');

// Test 1: Import core entry (no framework dependencies)
console.log('📦 Test 1: Import featurefly/core');
try {
  const core = require('../dist/cjs/core/index.js');
  console.log('  ✅ CJS core entry imported');

  if (!core.FeatureFlagsClient) throw new Error('FeatureFlagsClient not in core');
  console.log('  ✅ FeatureFlagsClient in core');

  if (!core.InMemoryCache) throw new Error('InMemoryCache not in core');
  console.log('  ✅ InMemoryCache in core');

  if (!core.CircuitBreaker) throw new Error('CircuitBreaker not in core');
  console.log('  ✅ CircuitBreaker in core');

  if (!core.EventEmitter) throw new Error('EventEmitter not in core');
  console.log('  ✅ EventEmitter in core');

  if (!core.ConsoleLogger) throw new Error('ConsoleLogger not in core');
  console.log('  ✅ ConsoleLogger in core');

  if (!core.withRetry) throw new Error('withRetry not in core');
  console.log('  ✅ withRetry in core');
} catch (error) {
  console.error(`  ❌ Failed: ${error.message}`);
  process.exit(1);
}

// Test 2: Import advanced entry
console.log('\n📦 Test 2: Import featurefly/advanced');
try {
  const advanced = require('../dist/cjs/advanced/index.js');
  console.log('  ✅ CJS advanced entry imported');

  if (!advanced.EdgeEvaluator) throw new Error('EdgeEvaluator not in advanced');
  console.log('  ✅ EdgeEvaluator in advanced');

  if (!advanced.ImpactMetrics) throw new Error('ImpactMetrics not in advanced');
  console.log('  ✅ ImpactMetrics in advanced');

  if (!advanced.FlagStreamClient) throw new Error('FlagStreamClient not in advanced');
  console.log('  ✅ FlagStreamClient in advanced');
} catch (error) {
  console.error(`  ❌ Failed: ${error.message}`);
  process.exit(1);
}

// Test 3: Instantiate client from core
console.log('\n🔧 Test 3: Instantiate FeatureFlagsClient from core');
try {
  const { FeatureFlagsClient } = require('../dist/cjs/core/index.js');

  const client = new FeatureFlagsClient({
    baseUrl: 'https://test.example.com',
    apiKey: 'test-key',
    cacheEnabled: false,
  });

  if (!client) throw new Error('Client not instantiated');
  console.log('  ✅ Client instantiated');

  if (typeof client.evaluateFlag !== 'function') {
    throw new Error('evaluateFlag not a function');
  }
  console.log('  ✅ evaluateFlag method exists');

  if (typeof client.on !== 'function') throw new Error('on not a function');
  console.log('  ✅ on (event emitter) method exists');

  if (typeof client.dispose !== 'function') throw new Error('dispose not a function');
  console.log('  ✅ dispose method exists');

  if (typeof client.getCacheStats !== 'function') throw new Error('getCacheStats not a function');
  console.log('  ✅ getCacheStats method exists');

  if (typeof client.getCircuitBreakerState !== 'function') throw new Error('getCircuitBreakerState not a function');
  console.log('  ✅ getCircuitBreakerState method exists');

  if (typeof client.setLocalOverride !== 'function') throw new Error('setLocalOverride not a function');
  console.log('  ✅ setLocalOverride method exists');

  client.dispose();
  console.log('  ✅ dispose works');
} catch (error) {
  console.error(`  ❌ Failed: ${error.message}`);
  process.exit(1);
}

// Test 4: Verify exports
console.log('\n📋 Test 4: Verify named exports');
try {
  const core = require('../dist/cjs/core/index.js');
  const advanced = require('../dist/cjs/advanced/index.js');

  const coreExports = Object.keys(core).filter(k => k !== 'default');
  const advancedExports = Object.keys(advanced).filter(k => k !== 'default');

  console.log(`  Core exports: ${coreExports.length}`);
  console.log(`  Advanced exports: ${advancedExports.length}`);

  if (coreExports.length < 5) throw new Error('Too few core exports');
  if (advancedExports.length < 3) throw new Error('Too few advanced exports');
  console.log('  ✅ Export counts look reasonable');
} catch (error) {
  console.error(`  ❌ Failed: ${error.message}`);
  process.exit(1);
}

// Test 5: Edge evaluator from advanced
console.log('\n🔧 Test 5: Instantiate EdgeEvaluator from advanced');
try {
  const { EdgeEvaluator } = require('../dist/cjs/advanced/index.js');

  const edgeDoc = {
    version: 1,
    fetchedAt: new Date().toISOString(),
    flags: [
      {
        id: 'test-1',
        slug: 'test-flag',
        name: 'Test Flag',
        category: 'both',
        defaultValue: true,
        valueType: 'boolean',
        version: 1,
        createdAt: '',
        updatedAt: '',
      },
    ],
  };

  const evaluator = new EdgeEvaluator(edgeDoc, {}, () => {});
  console.log('  ✅ EdgeEvaluator instantiated');

  if (typeof evaluator.evaluate !== 'function') {
    throw new Error('evaluate not a function');
  }
  console.log('  ✅ evaluate method exists');
} catch (error) {
  console.error(`  ❌ Failed: ${error.message}`);
  process.exit(1);
}

console.log('\n✅ All bundle verification tests passed!');

console.log('\n📊 Bundle sizes (gzipped):');
const { execSync } = require('child_process');
try {
  const distPath = join(rootDir, 'dist', 'cjs');
  const coreSize = execSync(`gzip -c ${distPath}/core/index.js | wc -c`).toString().trim();
  const advancedSize = execSync(`gzip -c ${distPath}/advanced/index.js | wc -c`).toString().trim();
  console.log(`  featurefly/core: ~${Math.round(coreSize / 1024)}KB (${coreSize} bytes)`);
  console.log(`  featurefly/advanced: ~${Math.round(advancedSize / 1024)}KB (${advancedSize} bytes)`);
} catch (e) {
  console.log('  (could not calculate sizes)');
}
