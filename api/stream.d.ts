import type { IncomingMessage, ServerResponse } from 'node:http';
declare function stream(req: IncomingMessage, res: ServerResponse): Promise<void>;
export = stream;
