import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { initialize } from '../dist/infrastructure/scaffold/init.js';
import { services, packageRoot } from '../dist/bootstrap.js';
const root=mkdtempSync(join(tmpdir(),'intent-demo-'));
try {
  initialize(root,packageRoot,{name:'Demo',language:'pt',ai:'copilot'});
  const s=services(root);
  assert.equal(s.validate(true).valid,true);
  assert.equal(s.test().passed,true);
  s.citeInto('BR-001','notes.md');
  assert.equal(s.citations().citations[0].status,'current');
  const a=s.load().artifacts.find(a=>a.artifact.metadata.id==='BR-001');
  const draft=structuredClone(a.artifact);draft.metadata.title+=' — revisada';
  s.createChange('review-rule','Clarificar título');
  s.stage('review-rule',a.path,stringify(draft));
  assert.equal(s.workspace.read(a.path).includes('revisada'),false);
  s.approve('review-rule','Demo reviewer');s.apply('review-rule');
  assert.equal(s.citations().citations[0].status,'stale');
  s.refreshCitation('notes.md');assert.equal(s.citations().citations[0].status,'current');
  console.log('Demo passed: init → validate/test → cite → stage → approve/apply → stale → refresh/current.');
} finally {rmSync(root,{recursive:true,force:true});}
