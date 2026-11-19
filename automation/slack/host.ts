import type { Adapter } from '../company-context/types.js';

/** The actual agent invokes native tools. A configuration file cannot connect a host. */
export class HostSlackAdapter implements Adapter {
  constructor(private operations: Adapter) {}
  identity: Adapter['identity'] = () => this.operations.identity();
  channels: Adapter['channels'] = cursor => this.operations.channels(cursor);
  history: Adapter['history'] = (channel, oldest, latest, cursor) => this.operations.history(channel, oldest, latest, cursor);
  thread: Adapter['thread'] = (channel, ts, cursor) => this.operations.thread(channel, ts, cursor);
  directory: Adapter['directory'] = cursor => this.operations.directory(cursor);
  join: NonNullable<Adapter['join']> = async channel => { if (!this.operations.join) throw new Error('Native Slack membership setup is unavailable.'); return this.operations.join(channel); };
  channel: NonNullable<Adapter['channel']> = async channel => { if (!this.operations.channel) throw new Error('Inspect the actual channel membership through the host.'); return this.operations.channel(channel); };
  permalink: NonNullable<Adapter['permalink']> = async (channel, ts) => { if (!this.operations.permalink) throw new Error('Retrieve the actual source link through the host; do not invent a permalink.'); return this.operations.permalink(channel, ts); };
}
