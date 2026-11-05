import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
const revision=process.argv[2];
if(!revision||!/^[a-f0-9]{7,40}$/u.test(revision))throw new Error('Usage: npm run companion:build -- REVISION');
mkdirSync('tmp/companion',{recursive:true});
const result=spawnSync('docker',['buildx','build','--platform','linux/amd64,linux/arm64','--file','deploy/companion/Dockerfile','--tag',`ghcr.io/trustrail/opintel-companion:${revision}`,'--output',`type=oci,dest=tmp/companion/opintel-companion-${revision}.oci.tar`,'.'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
