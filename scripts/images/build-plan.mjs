export const runtimeImages=['api','engine','console','egress','migrations','provisioning'];
export function selectedImages(value='all'){
 if(value==='all')return [...runtimeImages];
 if(!runtimeImages.includes(value))throw new Error('IMAGE must be api, engine, console, egress, migrations, provisioning or all.');
 return [value];
}
export function targetPlatforms(value='linux/amd64,linux/arm64'){
 const platforms=value.split(',');
 if(!platforms.length||new Set(platforms).size!==platforms.length||platforms.some(p=>!['linux/amd64','linux/arm64'].includes(p)))throw new Error('PLATFORM must be linux/amd64, linux/arm64, or their comma-separated pair.');
 return platforms;
}
export function runtimeBase(target){return target==='egress'?'firewall-runtime':'runtime-base';}
