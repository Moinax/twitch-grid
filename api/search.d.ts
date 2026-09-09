import type { IncomingMessage, ServerResponse } from 'node:http';
declare function search(req: IncomingMessage, res: ServerResponse): Promise<void>;
export = search;
