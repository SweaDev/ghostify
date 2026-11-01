import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A fresh document holding the trimmed dev.to home page fixture. */
export function devtoDoc(): Document {
  const html = readFileSync(join(__dirname, 'fixtures/devto.html'), 'utf8');
  const doc = document.implementation.createHTMLDocument('DEV Community');
  doc.documentElement.innerHTML = html.replace(/^<!doctype html>\s*<html[^>]*>|<\/html>\s*$/gi, '');
  doc.body.dataset.userStatus = 'logged-out';
  return doc;
}
