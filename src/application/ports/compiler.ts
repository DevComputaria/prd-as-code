import type { Model, SourceFile } from '../../domain/model.js';
export interface Compiler { compile(files: SourceFile[]): Model }
