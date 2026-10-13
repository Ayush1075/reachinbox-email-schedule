import net from 'node:net';

/**
 * Minimal in-process SMTP server for integration tests. Accepts AUTH
 * PLAIN/LOGIN, records every message, and can be told to reject recipients
 * with a permanent (5xx) or transient (4xx) error.
 */
export type CapturedMessage = { from: string; to: string[]; data: string };

export type SmtpSink = {
  port: number;
  messages: CapturedMessage[];
  /** Reply to RCPT TO with this code (e.g. 550 or 451); null = accept. */
  rejectWith: number | null;
  close(): Promise<void>;
};

export async function startSmtpSink(): Promise<SmtpSink> {
  const sink: SmtpSink = { port: 0, messages: [], rejectWith: null, close: async () => {} };

  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let authStep: 'none' | 'user' | 'pass' = 'none';
    let current: CapturedMessage = { from: '', to: [], data: '' };
    const reply = (line: string) => socket.write(`${line}\r\n`);

    reply('220 sink ESMTP ready');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          current.data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          sink.messages.push(current);
          current = { from: '', to: [], data: '' };
          reply(`250 OK queued as ${sink.messages.length}`);
          continue;
        }
        const nl = buffer.indexOf('\r\n');
        if (nl === -1) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const cmd = line.toUpperCase();

        if (authStep === 'user') {
          authStep = 'pass';
          reply('334 UGFzc3dvcmQ6');
        } else if (authStep === 'pass') {
          authStep = 'none';
          reply('235 Authentication successful');
        } else if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) {
          reply('250-sink');
          reply('250-AUTH PLAIN LOGIN');
          reply('250 8BITMIME');
        } else if (cmd.startsWith('AUTH PLAIN')) {
          reply('235 Authentication successful');
        } else if (cmd.startsWith('AUTH LOGIN')) {
          authStep = 'user';
          reply('334 VXNlcm5hbWU6');
        } else if (cmd.startsWith('MAIL FROM')) {
          current.from = line.slice(10).trim();
          reply('250 OK');
        } else if (cmd.startsWith('RCPT TO')) {
          if (sink.rejectWith) reply(`${sink.rejectWith} Recipient rejected by test sink`);
          else {
            current.to.push(line.slice(8).trim());
            reply('250 OK');
          }
        } else if (cmd === 'DATA') {
          inData = true;
          reply('354 End data with <CR><LF>.<CR><LF>');
        } else if (cmd === 'RSET' || cmd === 'NOOP') {
          reply('250 OK');
        } else if (cmd === 'QUIT') {
          reply('221 Bye');
          socket.end();
        } else {
          reply('502 Command not implemented');
        }
      }
    });
    socket.on('error', () => {});
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  sink.port = (server.address() as net.AddressInfo).port;
  sink.close = () => new Promise((resolve) => server.close(() => resolve()));
  return sink;
}
