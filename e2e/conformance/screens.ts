import {screens,settingsSections,poolTabs,dataTabs,accountDialogs} from '../../src/console-next/routing.js';
import {consoleAuthPaths} from '../../src/shared/console-destinations.mjs';
/** Enumerate the same registries consumed by the application; a new screen,
 * settings section, tab or URL-owned dialog necessarily adds a required visit. */
export function screenPaths():string[]{return [...new Set([
 ...consoleAuthPaths,
 ...screens.map(screen=>'/?screen='+screen),
 ...settingsSections.map(section=>'/?screen=settings&section='+section),
 ...poolTabs.map(tab=>'/?screen=pools&tab='+tab),
 ...dataTabs.map(tab=>'/?screen=data&tab='+tab),
 ...accountDialogs.map(dialog=>'/?dialog='+dialog),
])].sort();}
export function matchesScreen(pattern:string,path:string):boolean{
 const a=new URL(pattern,'http://console.invalid'),b=new URL(path,'http://console.invalid');
 return a.pathname===b.pathname&&[...a.searchParams].every(([key,value])=>b.searchParams.get(key)===value);
}
