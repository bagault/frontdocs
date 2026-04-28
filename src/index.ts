// Public API surface.
export * from './core/types.js';
export { loadConfig, DEFAULT_CONFIG } from './core/config.js';
export { analyzeVault } from './core/analyzer.js';
export { exportSite } from './exporter/exporter.js';
export { buildWithMkdocs, ensureVenv } from './sidecars/mkdocs.js';
export { verifyBuild } from './exporter/verify.js';
export { buildCosmosArtifact } from './graph/cosmos.js';
