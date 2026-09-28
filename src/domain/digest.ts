import { createHash } from 'node:crypto';
/** Pure SHA-256 over UTF-8 input. No time, filesystem, or random state. */
export const digest = (value: string): string => 'sha256:' + createHash('sha256').update(value).digest('hex');
