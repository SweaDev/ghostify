import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync(join(__dirname, 'fixtures/devto.html'), 'utf8').replace(
  /^<!doctype html>\s*<html[^>]*>|<\/html>\s*$/gi,
  '',
);

/** Loads the trimmed dev.to home page fixture into `doc` (default: the live test document). */
export function devtoDoc(doc: Document = document): Document {
  doc.documentElement.innerHTML = html;
  doc.body.dataset.userStatus = 'logged-out';
  return doc;
}
