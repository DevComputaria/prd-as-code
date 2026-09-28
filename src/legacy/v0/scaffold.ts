import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { atomicWrite, exclusiveWrite, inside } from './fs.js';
import { loadProduct, serialize } from './model.js';
import { saveSnapshot } from './citations.js';
import { PREFIX, ProdshapeError } from './types.js';
import type { ItemType, Metadata } from './types.js';

export function template(type: ItemType, id: string, title: string): { meta: Metadata; body: string } {
  const meta: Metadata = { id, type, title, status: 'draft', relations: {} };
  if (type === 'behavior') meta.behavior = { given: ['The precondition is satisfied'], when: ['The actor performs the action'], then: ['The expected outcome is observable'] };
  return { meta, body: `# ${title}\n\nDescribe the ${type} and its boundaries here.` };
}
export function init(directory: string, name: string): string {
  const root = resolve(directory);
  if (existsSync(root) && readdirSync(root).length) throw new ProdshapeError(`Directory is not empty: ${root}. Choose a new or empty directory.`, 'DIRECTORY_NOT_EMPTY');
  mkdirSync(root, { recursive: true });
  // Validate the destination before writing any project files.
  inside(root, 'prodshape.json');
  exclusiveWrite(join(root, 'prodshape.json'), JSON.stringify({ schemaVersion: 1, name, docs: 'product' }, null, 2) + '\n');
  const entries: Array<[ItemType, string, string, Metadata['relations'], string]> = [
    ['actor', 'ACT-001', 'Customer', {}, 'A customer purchases products and tracks their orders.'],
    ['term', 'TERM-001', 'Order', {}, 'An order records a customer’s accepted purchase request.'],
    ['rule', 'BR-001', 'Positive order total', { defines: ['TERM-001'] }, 'An order total must be greater than zero.'],
    ['requirement', 'REQ-001', 'Reject zero-value orders', { 'governed-by': ['BR-001'] }, 'The system must reject an order whose total is zero and explain why.'],
    ['use-case', 'UC-001', 'Place an order', { 'performed-by': ['ACT-001'], satisfies: ['REQ-001'], 'governed-by': ['BR-001'] }, 'The customer submits an order. The system validates the total before accepting it.'],
    ['journey', 'JRN-001', 'Purchase a product', { 'performed-by': ['ACT-001'], contains: ['UC-001'] }, 'The customer selects a product, places an order, and receives confirmation.'],
    ['behavior', 'BEH-001', 'Reject an empty order', { verifies: ['REQ-001'], uses: ['UC-001'] }, 'This executable-style scenario documents the rejection contract.'],
  ];
  for (const [type, id, title, relations, body] of entries) {
    const item = template(type, id, title); item.meta.relations = relations; item.meta.status = 'active';
    if (type === 'behavior') item.meta.behavior = { given: ['A customer has an order with a total of zero'], when: ['The customer submits the order'], then: ['The order is rejected', 'The customer sees “Order total must be greater than zero”'] };
    atomicWrite(inside(root, `product/${type}/${id}.md`), serialize(item.meta, `# ${title}\n\n${body}`));
  }
  atomicWrite(inside(root, 'README.md'), `# ${name}\n\nA versioned product definition managed with prodshape.\n\n\`\`\`sh\nprodshape validate\nprodshape graph --format mermaid\nprodshape trace BR-001 --direction in --depth 3\nprodshape cite BR-001 --into notes/design.md\nprodshape citations check\n\`\`\`\n\nCommit product/, prodshape.json, and .prodshape/ (except write.lock).\n`);
  atomicWrite(inside(root, '.gitignore'), '.prodshape/write.lock\nnode_modules/\n');
  for (const item of loadProduct(root).items) saveSnapshot(root, item);
  return root;
}
export function nextId(type: ItemType, ids: string[]): string {
  const numbers = ids.filter(id => id.startsWith(`${PREFIX[type]}-`)).map(id => Number(id.split('-')[1]));
  return `${PREFIX[type]}-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}
