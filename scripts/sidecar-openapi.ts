import { landingReceiptOpenApiDocument } from '../src/shared/landing-contract.js';
import { writeFile } from 'node:fs/promises';
import { sidecarOpenApiDocument } from '../src/shared/sidecar-contract.js';
await writeFile(new URL('../sidecar/openapi.json',import.meta.url),JSON.stringify(sidecarOpenApiDocument(),null,2)+'\n');
await writeFile(new URL('../sidecar/landing-receipt.openapi.json', import.meta.url), JSON.stringify(landingReceiptOpenApiDocument(), null, 2) + '\n');
