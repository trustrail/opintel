import {readFileSync,readdirSync} from 'node:fs';
import {it,expect} from 'vitest';
function luminance(value:string){const channels=value.match(/[a-f\d]{2}/gi)!.map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return channels[0]!*.2126+channels[1]!*.7152+channels[2]!*.0722;}
function contrast(a:string,b:string){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]!+.05)/(values[1]!+.05);}
it('foundations: primary, secondary, state and action text maintain AA contrast in both themes',()=>{
 const text=readFileSync('src/console-next/tokens.css','utf8'),blocks=text.split(':root[data-theme="dark"]'),tokens=(block:string)=>Object.fromEntries([...block.matchAll(/--([\w-]+):(#[a-f\d]{6})/gi)].map(m=>[m[1]!,m[2]!]));
 const light=tokens(blocks[0]!),dark={...light,...tokens(blocks[1]!.split('}')[0]!)};
 for(const theme of [light,dark])for(const [fg,bg] of [['ink','surface'],['muted','surface'],['ink','bg'],['muted','bg'],['warning','warning-bg'],['down','down-bg'],['ok','ok-bg'],['unknown','neutral'],['white','plum'],['plum','green'],['rail-ink','rail']])expect(contrast(theme[fg!]!,theme[bg!]!),`${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
});
it('foundations: one token file owns colours; no screen creates a CSS class or hard-coded colour',()=>{
 for(const file of ['styles.css','home/screen.tsx','components/ring.tsx','components/strip.tsx','components/scope.tsx','components/chip.tsx','activity/styles.css','activity/screen.tsx','activity/band.tsx','activity/receipt.tsx','data/styles.css','data/screen.tsx','data/band.tsx','data/connect.tsx','data/suggestions.tsx','data/treatment.tsx']){const body=readFileSync('src/console-next/'+file,'utf8');expect(body).not.toMatch(/#[0-9a-f]{3,8}\b/i);expect(body).not.toContain('className=');expect(body).not.toMatch(/\[data-state\]\s*\{/);}
});

it('CONSOLE-03 every component stylesheet uses colour tokens, including future files',()=>{
 const files=readdirSync('src/console-next',{recursive:true}).map(String).filter(f=>f.endsWith('.css')&&f!=='tokens.css');
 for(const file of files){const body=readFileSync('src/console-next/'+file,'utf8');expect(body,file).not.toMatch(/#[a-f0-9]{3,8}\b|rgba?\(|hsla?\(|(?:color|background|border-color)\s*:\s*(?:white|black|red|green|blue)\b/iu);}
 const tokens=readFileSync('src/console-next/tokens.css','utf8');expect(tokens).toContain(':root[data-theme="dark"]');expect(tokens).toContain('@media (prefers-color-scheme: dark)');expect(tokens).toContain(':root:not([data-theme="light"])');
 const html=readFileSync('src/console-next/index.html','utf8');expect(html.indexOf("opintel.theme")).toBeLessThan(html.indexOf('/main.tsx'));
});

it('CONSOLE-03 report-band treatment marks retain graphical contrast in either theme',()=>{
 const text=readFileSync('src/console-next/tokens.css','utf8'),tokens=Object.fromEntries([...text.matchAll(/--([\w-]+):(#[a-f\d]{6})/gi)].map(m=>[m[1]!,m[2]!]));
 for(const name of ['clear','tokenized','masked','aggregate-only','custody','withheld','undecided'])expect(contrast(tokens['band-'+name]!,tokens.plum!),name).toBeGreaterThanOrEqual(3);
});
