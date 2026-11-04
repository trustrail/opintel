// Every gateway/engine bundle uses this check on actual esbuild inputs. Shared
// contracts and agent protocol libraries may be reused; command ownership may not.
const application=new Set(['api','engine','console','egress','migrations','provisioning']);
const verification=/^scripts\/(?:verification\/|soak\/|operator\/(?:demo|customer-demo|run-soak|reinsurance|prepare|provision(?:-service)?|seed-options|xq-roundtrip)(?:\.|\/)|operator\/infrastructure\/synthetic-source)/u;
const agent=/^scripts\/(?:agent\/|operator\/identity-import\.|steps\/(?:main|identity-exchange|service)\.|steps\/infrastructure\/(?:device|xq-device|unseal|identity|mcp|mtls-fetch))/u;
export function assertPackageInputs(target,inputs){
 const rejected=inputs.filter(file=>/^(?:test|e2e|reference)\//u.test(file)||application.has(target)&&(verification.test(file)||agent.test(file))||target==='agent-kit'&&verification.test(file)||target==='demo-tools'&&/^scripts\/agent\//u.test(file));
 if(rejected.length)throw new Error(`Package boundary violation in ${target}: ${rejected.join(', ')}`);
}
