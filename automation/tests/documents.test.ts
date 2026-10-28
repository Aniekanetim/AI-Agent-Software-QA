import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const ignored = new Set(['.git', '.local', 'node_modules', 'output', '.postman']);
function documents(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = resolve(folder, entry.name);
    return entry.isDirectory() ? ignored.has(entry.name) ? [] : documents(file) : /\.md$/i.test(entry.name) ? [file] : [];
  });
}
function headings(text: string) {
  const counts = new Map<string, number>(), anchors = new Set<string>();
  for (const line of text.replace(/```[\s\S]*?```/g, '').split(/\r?\n/)) {
    if (!/^#{1,6}\s/.test(line)) continue;
    const base = line.replace(/^#{1,6}\s+/, '').trim().toLowerCase().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-');
    const count = counts.get(base) ?? 0; counts.set(base, count + 1); anchors.add(base + (count ? `-${count}` : ''));
  }
  return anchors;
}

test('shared Markdown links and anchors resolve from the current QA root', context => {
  const root = process.cwd(), errors: string[] = []; let checked = 0;
  for (const file of documents(root)) {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
    for (const match of text.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const url = match[1]!.replace(/^<|>$/g, ''); if (/^[a-z][\w+.-]*:/i.test(url)) continue;
      const [path, anchor] = url.split('#'); const target = path ? resolve(dirname(file), decodeURIComponent(path.split('?')[0]!)) : file;
      checked++;
      if (!existsSync(target)) errors.push(`${relative(root, file)}: missing ${url}`);
      else if (anchor && statSync(target).isFile() && /\.md$/i.test(target) && !headings(readFileSync(target, 'utf8')).has(decodeURIComponent(anchor))) errors.push(`${relative(root, file)}: missing anchor ${url}`);
    }
  }
  assert.deepEqual(errors, [], errors.join('\n')); assert(checked > 0); context.diagnostic(`Checked ${checked} local Markdown targets/anchors.`);
});
