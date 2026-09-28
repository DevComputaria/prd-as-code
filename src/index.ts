export * from './domain/model.js';
export * from './domain/decisions.js';
export * from './domain/graph.js';
export * from './application/ports/compiler.js';
export * from './application/ports/workspace.js';
export * from './application/product-service.js';
export { createCompiler } from './compiler/compile.js';
export { createWorkspace } from './infrastructure/filesystem/workspace.js';
export { services } from './bootstrap.js';
