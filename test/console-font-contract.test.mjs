import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('Inter is a real self-hosted WOFF2, with its OFL and no external font import',()=>{
 const font=readFileSync('src/console-next/public/fonts/InterVariable.woff2');expect(font.subarray(0,4).toString()).toBe('wOF2');expect(font.length).toBeGreaterThan(100000);
 expect(readFileSync('src/console-next/public/fonts/OFL.txt','utf8')).toContain('SIL OPEN FONT LICENSE');
 const css=readFileSync('src/console-next/styles.css','utf8');expect(css).toContain("url('/fonts/InterVariable.woff2')");expect(css).not.toMatch(/https?:\/\//);
});
