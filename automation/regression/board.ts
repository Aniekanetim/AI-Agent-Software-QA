import { boardFiles, field } from '../board/layout.js';
import type { Assignment } from '../release/scope.js';
import type { Connection } from '../task-source/provider.js';

export interface ReleaseBoard {
  assignment: Assignment;
  rows: { id: string; revision: string; linked: boolean; parentSpecified?: boolean; ambiguous?: boolean }[];
}

export function localReleaseBoard(root: string, assignment: Assignment): ReleaseBoard {
  return {
    assignment,
    rows: boardFiles(root).flatMap(ticket => {
      if (!ticket.id.startsWith('BUG-') || field(ticket.text, 'Type').toLowerCase() !== 'bug') return [];
      const ids = new Set(field(ticket.text, 'Parent assignment').match(/\b[A-Z][A-Z0-9]{0,15}-\d{1,9}\b/g));
      const linked = ids.has(assignment.ticketId);
      return [{ id: ticket.id, revision: ticket.revision, linked, parentSpecified: ids.size > 0, ...(linked && ids.size > 1 ? { ambiguous: true } : {}) }];
    }),
  };
}

// Atlassian document descriptions use structured blocks, while the other adapters expose text.
function descriptionText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const node = value as { type?: string; text?: string; content?: unknown[]; marks?: { type?: string; attrs?: { href?: string } }[] };
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'text' && typeof node.text === 'string') {
    const link = node.marks?.find(mark => mark.type === 'link' && typeof mark.attrs?.href === 'string');
    return link ? `[${node.text}](${link.attrs!.href})` : node.text;
  }
  if (node.type === 'codeBlock') return '';
  if (!Array.isArray(node.content)) return '';
  const parts = node.content.map(descriptionText);
  if (node.type === 'tableRow') return `| ${parts.join(' | ')} |`;
  return parts.join(node.type === 'paragraph' || node.type === 'tableCell' ? '' : '\n');
}

function nativeParentValues(value: unknown) {
  const parents: string[] = [], origins: string[] = [];
  let fence = '';
  for (const line of descriptionText(value).split(/\r?\n/)) {
    const marker = line.trimStart().match(/^(`{3,}|~{3,})/)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = '';
      continue;
    }
    if (fence) continue;
    const field = line.match(/^\s*(Parent assignment|Originating QA ticket)\s*:\s*(.+)$/i) ??
      line.match(/^\s*\|\s*(Parent assignment|Originating QA ticket)\s*\|\s*(.+?)\s*\|\s*$/i);
    if (!field) continue;
    const values = field[1]!.toLowerCase() === 'parent assignment' ? parents : origins;
    const reference = field[2]!.trim();
    values.push(reference.match(/^\[[^\]]+\]\(([^)]+)\)$/)?.[1] ?? reference);
  }
  return { values: [...new Set(parents.length ? parents : origins)], explicit: parents.length > 0 };
}

export function nativeReleaseBoard(assignment: Assignment, connection: Connection): ReleaseBoard {
  const parent = connection.tickets.find(ticket => ticket.id === assignment.ticketId);
  const descriptions = connection.descriptions;
  if (!parent || !descriptions || connection.tickets.some(ticket => !Object.hasOwn(descriptions, ticket.id))) {
    throw new Error('Observe the release assignment and its ticket relationships on the canonical live board.');
  }
  const identifiers = new Set([parent.id, parent.url, decodeURIComponent(new URL(parent.url).pathname.split('/').at(-1)!)]);
  return {
    assignment,
    rows: connection.tickets.filter(ticket => ticket.id !== parent.id).map(ticket => {
      const { values, explicit } = nativeParentValues(descriptions[ticket.id]);
      const linked = values.some(value => identifiers.has(value));
      const ambiguous = linked && values.some(value => !identifiers.has(value));
      return { id: ticket.id, revision: ticket.revision, linked, parentSpecified: explicit, ...(ambiguous ? { ambiguous } : {}) };
    }),
  };
}
