import {X509Certificate} from 'node:crypto';

/** SHA-256 of the complete public certificate, matching the registry pin. */
export function certificatePin(certificate:string):string {
  return new X509Certificate(certificate).fingerprint256.replaceAll(':','').toUpperCase();
}
