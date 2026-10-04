import {setInterval,clearInterval} from 'node:timers';
import { createServer as http } from 'node:http';
import { createServer as https } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
http((request, response) => response.end('reachable')).listen(8444, '0.0.0.0');
const waiting = setInterval(() => {
  const base = '/ingest/control/tls-config/tls/';
  if (!existsSync('/ingest/control/provisioned')) return;
  clearInterval(waiting);
  https({cert: readFileSync(base + 'client.pem'), key: readFileSync(base + 'client.key'), ca: readFileSync(base + 'ca.pem'), requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.3'}, (request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      response.statusCode = request.method === 'POST' && request.url === '/landing-receipt' && body === '{"probe":"SD-005"}' ? 204 : 400;
      response.end();
    });
  }).listen(8443, '0.0.0.0');
}, 100);
