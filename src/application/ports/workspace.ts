import type { Configuration, SourceFile } from '../../domain/model.js';
export interface Workspace {
  readonly root: string;
  config(): Configuration;
  productFiles(): SourceFile[];
  read(path: string): string | null;
  write(path: string, content: string): void;
  remove(path: string): void;
  markdownFiles(): SourceFile[];
  lock<T>(operation: () => T): T;
}
