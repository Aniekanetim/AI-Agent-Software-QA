import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { extname } from 'node:path';
import { digest, requireText } from '../shared/store.js';

const maxBytes = 4 * 1024 * 1024;
const maxFields = 128;
const maxRows = 10_000;
export type SourceFormat = 'csv' | 'markdown-table' | 'markdown-profiles';
export interface SourceSelection {
  file: string;
  format?: SourceFormat;
  table?: number;
  fromLine?: number;
  throughLine?: number;
}
interface Row { line: number; cells: string[] }
interface Table { line: number; fields: string[]; rows: Row[] }

function readSource(file: string) {
  requireText(file, 'Source file path');
  const before = lstatSync(file);
  if (!before.isFile()) throw new Error('Select a regular local source file.');
  const fd = openSync(file, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > maxBytes) {
      throw new Error('Select a stable regular source file no larger than 4 MiB.');
    }
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (!count) break;
      offset += count;
    }
    if (offset !== stat.size || fstatSync(fd).mtimeMs !== stat.mtimeMs) throw new Error('The source changed during inspection. Inspect it again.');
    const bytes = buffer.subarray(0, offset);
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('Use a UTF-8 source file.'); }
    if (content.includes('\0')) throw new Error('Use a UTF-8 text source.');
    return { bytes, content, sha256: digest(bytes) };
  } finally { closeSync(fd); }
}

function csv(content: string): Table {
  const rows: Row[] = [];
  let cells: string[] = [], value = '', line = 1, start = 1;
  let quoted = false, closed = false, touched = false;
  function field() {
    if (cells.length >= maxFields) throw new Error('Split the source into selections of at most 128 fields.');
    cells.push(value); value = ''; closed = false;
  }
  function record() {
    if (rows.length > maxRows) throw new Error('Split the source into files of at most 10,000 records.');
    field(); rows.push({ line: start, cells }); cells = []; touched = false;
  }
  for (let i = 0; i < content.length; i++) {
    const char = content[i]!;
    const newline = char === '\r' || char === '\n';
    const pair = char === '\r' && content[i + 1] === '\n';
    if (quoted) {
      if (char === '"') {
        if (content[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        value += pair ? '\r\n' : char;
        if (newline) { line++; if (pair) i++; }
      }
    } else if (newline) {
      record(); line++; start = line;
      if (pair) i++;
    } else if (char === ',') {
      field(); touched = true;
    } else if (char === '"' && !value && !closed) {
      quoted = true; touched = true;
    } else {
      if (closed || char === '"') throw new Error(`Malformed CSV quoting at line ${line}. Correct the source or use an approved derived file.`);
      value += char; touched = true;
    }
  }
  if (quoted) throw new Error(`Unclosed CSV quote in the record starting at line ${start}.`);
  if (touched) record();
  const header = rows.shift();
  if (!header || !header.cells.some(cell => cell.trim())) throw new Error('Supply a CSV header on the first line.');
  return { line: 1, fields: header.cells, rows };
}

function markdownRows(content: string) {
  let fence: string | undefined;
  const lines = content.split(/\r\n|\n|\r/);
  if (lines.length > 50_000) throw new Error('Split the Markdown source into files of at most 50,000 lines.');
  return lines.map((text, i) => {
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    const hidden = Boolean(fence || marker);
    if (marker) {
      if (!fence) fence = marker[1]!;
      else if (marker[1]!.startsWith(fence) && !marker[2]!.trim()) fence = undefined;
    }
    return { line: i + 1, text: hidden ? '' : text };
  });
}

function pipeCells(text: string) {
  if (!/^\s*\|.*\|\s*$/.test(text)) return undefined;
  return text.trim().slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim().replaceAll('\\|', '|'));
}

function markdownTables(lines: ReturnType<typeof markdownRows>): Table[] {
  const tables: Table[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const header = pipeCells(lines[i]!.text), divider = pipeCells(lines[i + 1]!.text);
    if (!header || divider?.length !== header.length || !divider.every(cell => /^:?-{3,}:?$/.test(cell))) continue;
    if (header.length > maxFields) throw new Error('Select a table of at most 128 fields.');
    const table: Table = { line: lines[i]!.line, fields: header, rows: [] };
    i++;
    while (i + 1 < lines.length) {
      const next = lines[i + 1]!, cells = pipeCells(next.text);
      if (!cells) break;
      if (table.rows.length >= maxRows || cells.length > maxFields) throw new Error('Select a table of at most 10,000 records and 128 fields.');
      table.rows.push({ line: next.line, cells });
      i++;
    }
    tables.push(table);
  }
  return tables;
}

function profiles(lines: ReturnType<typeof markdownRows>): Table {
  const fields = new Set<string>(), profiles: { line: number; fields: Map<string, string> }[] = [];
  let current: typeof profiles[number] | undefined;
  for (const { line, text } of lines) {
    if (/^ {0,3}#{1,6}\s+\S/.test(text)) {
      current = { line, fields: new Map() };
      continue;
    }
    const match = text.match(/^\s*[-*+]\s+`([A-Za-z][A-Za-z0-9_-]*)`:\s*(.*?)\s*$/);
    if (!current || !match) continue;
    const key = match[1]!, value = match[2]!;
    if (current.fields.has(key)) throw new Error(`Repeated profile field at line ${line}. Use an unambiguous source or select another section.`);
    if (!current.fields.size) profiles.push(current);
    fields.add(key);
    if (fields.size > maxFields || profiles.length > maxRows) throw new Error('Select a profile section of at most 10,000 records and 128 fields.');
    current.fields.set(key, /^`[^`]*`$/.test(value) ? value.slice(1, -1) : value);
  }
  if (!profiles.length) throw new Error('No headings with labeled profile fields were found in the selected lines.');
  return {
    line: profiles[0]!.line,
    fields: [...fields],
    rows: profiles.map(profile => ({ line: profile.line, cells: [...fields].map(key => profile.fields.get(key) ?? '') })),
  };
}

function summarize(table: Table) {
  const records = new Set<string>(), issues: { line: number; code: string; field?: number }[] = [];
  let issueCount = 0;
  function issue(line: number, code: string, field?: number) {
    issueCount++;
    if (issues.length < 100) issues.push({ line, code, ...(field === undefined ? {} : { field }) });
  }
  const labels = new Set<string>();
  const fields = table.fields.map((_, i) => ({ field: i + 1, nonblank: 0, repeats: 0, seen: new Set<string>() }));
  table.fields.forEach((label, i) => {
    const key = label.trim().toLowerCase();
    if (!key || labels.has(key)) issue(table.line, key ? 'duplicateFieldLabel' : 'blankFieldLabel', i + 1);
    labels.add(key);
  });
  for (const { cells, line } of table.rows) {
    if (cells.length !== table.fields.length) issue(line, 'fieldCountMismatch');
    const key = JSON.stringify(cells.map(cell => cell.trim().toLowerCase()));
    if (records.has(key)) issue(line, 'duplicateRecord');
    records.add(key);
    cells.forEach((cell, i) => {
      const trimmed = cell.trim(), stats = fields[i];
      if (!trimmed) issue(line, 'blankValue', i + 1);
      else if (stats) {
        const normalized = trimmed.toLowerCase();
        stats.nonblank++;
        if (stats.seen.has(normalized)) stats.repeats++;
        stats.seen.add(normalized);
      }
      if (/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/im.test(trimmed)) issue(line, 'identifierLikeValue', i + 1);
    });
  }
  return {
    headerLine: table.line, fieldCount: table.fields.length, records: table.rows.length,
    fields: fields.map(({ field, nonblank, repeats }) => ({ field, nonblank, repeats })), issueCount, issues,
  };
}

export function inspectSource(selection: SourceSelection) {
  const source = readSource(selection.file);
  const extension = extname(selection.file).toLowerCase();
  const format = selection.format ?? (extension === '.csv' ? 'csv' : extension === '.md' ? 'markdown-table' : undefined);
  if (!format || !['csv', 'markdown-table', 'markdown-profiles'].includes(format)) throw new Error('Select CSV, Markdown tables, or Markdown profiles.');
  const { table, fromLine, throughLine } = selection;
  for (const value of [table, fromLine, throughLine]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error('Use positive integers for table and line selection.');
  }
  if ((format !== 'markdown-table' && table !== undefined) ||
      (format === 'csv' && (fromLine !== undefined || throughLine !== undefined)) ||
      (fromLine ?? 1) > (throughLine ?? Infinity)) throw new Error('Use a line range for Markdown and a table number for Markdown tables.');
  const lines = format === 'csv' ? [] : markdownRows(source.content).filter(row => row.line >= (fromLine ?? 1) && row.line <= (throughLine ?? Infinity));
  const tables = format === 'csv' ? [csv(source.content)] : format === 'markdown-profiles' ? [profiles(lines)] : markdownTables(lines);
  if (table !== undefined && !tables[table - 1]) throw new Error('The selected Markdown table was not found.');
  const selected = table ?? (tables.length === 1 ? 1 : undefined);
  const summary = {
    format, bytes: source.bytes.length, sha256: source.sha256, selectedTable: selected ?? null,
    tableCount: tables.length,
    tables: (selected ? [tables[selected - 1]!] : tables.slice(0, 25)).map((entry, i) => ({ table: selected ?? i + 1, ...summarize(entry) })),
  };
  return { source, summary, table: selected ? tables[selected - 1] : undefined };
}
