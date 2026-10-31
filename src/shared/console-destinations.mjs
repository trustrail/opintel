/* global URL, URLSearchParams */
export const consoleAuthPaths=['/sign-in','/check-email','/auth/callback','/auth/confirm-device'];
/** Compatibility redirects only. Never authorizes or reads application data. */
export function consoleDestination(href){
 const u=new URL(href,'http://console.invalid'),original=u.pathname,p=original.replace(/^\/legacy(?=\/|$)/u,'')||'/',q=new URLSearchParams(u.search);
 const next=screen=>{if(screen)q.set('screen',screen);if(screen==='data'&&q.has('sourceId')){q.set('source',q.get('sourceId'));q.delete('sourceId');}q.delete('advanced');return '/'+(q.size?'?'+q:'')+u.hash;};
 if(original!==p&&p==='/')return next('');
 if(consoleAuthPaths.includes(p))return original===p?null:p+u.search+u.hash;
 if(p==='/console-next'||p.startsWith('/console-next/'))return next('');
 if(p.startsWith('/dev/')||p==='/companies/new')return next('');
 if(p==='/settings'){q.set('dialog','you');return next('');}
 if(p==='/projects/new'){q.set('dialog','new-project');return next('');}
 if(p==='/projects'){if(q.has('companyId'))q.set('switcher','true');return next('');}
 const company=/^\/companies\/([^/]+)\/settings$/u.exec(p);if(company){q.set('companyId',company[1]);q.set('section','company');return next('settings');}
 const globals={'/dashboard':'','/activity':'activity','/data-sources':'data','/entitlements':'data','/pools':'pools','/access':'settings'};
 if(Object.hasOwn(globals,p)){if(p==='/data-sources')q.set('tab','sources');if(p==='/access')q.set('section','people');return next(globals[p]);}
 const m=/^\/projects\/([^/]+)\/(.+)$/u.exec(p);if(!m)return null;
 q.set('project',m[1]);const screen=m[2];
 if(screen==='dashboard')return next('');
 if(screen==='activity'){if(q.has('poolId')){q.set('pool',q.get('poolId'));q.delete('poolId');}return next('activity');}
 const run=/^runs\/([^/]+)$/u.exec(screen);if(run){q.set('run',run[1]);return next('activity');}
 if(screen==='pools')return next('pools');
 const agent=/^pools\/([^/]+)\/agents\/(.+)$/u.exec(screen);if(agent){q.set('pool',agent[1]);q.set('agent',decodeURIComponent(agent[2]));q.set('tab','agents');return next('pools');}
 const pool=/^pools\/([^/]+)$/u.exec(screen);if(pool){q.set('pool',pool[1]);return next('pools');}
 if(screen==='entitlements'){
  if(q.has('rowDecisionId')||q.has('rowObjectId')||q.get('rowFilter')==='unscoped'){
   if(q.has('poolId')){q.set('pool',q.get('poolId'));q.delete('poolId');}
   if(q.has('rowObjectId')){q.set('rows',q.get('rowObjectId'));q.delete('rowObjectId');}q.set('tab','access');return next('pools');
  }
  if(!q.has('decision')&&q.has('undecided'))q.set('decision',q.get('undecided')==='false'?'all':'undecided');q.delete('undecided');q.set('tab','entitlements');return next('data');
 }
 if(screen==='relationship-suggestions'){q.set('tab','suggestions');return next('data');}
 if(screen==='catalog'){q.set('tab','entitlements');q.set('declarations','true');return next('data');}
 if(screen==='data-sources'){q.set('tab','sources');return next('data');}
 const scan=/^introspections\/([^/]+)$/u.exec(screen);if(scan){q.set('scan',scan[1]);q.set('sourceView','scans');q.set('tab','sources');return next('data');}
 const scans=/^sources\/([^/]+)\/introspections$/u.exec(screen);if(scans){q.set('source',scans[1]);q.set('sourceView','scans');q.set('tab','sources');return next('data');}
 if(screen==='observations'){const kind=q.get('observationKind')??q.get('observationGroup')?.split(':')[0];if(kind==='custody'){q.set('section','token');q.set('verify','true');return next('settings');}if(kind==='type'){q.set('tab','entitlements');q.set('unsupported','true');}else{q.set('tab','sources');q.set('held','true');}return next('data');}
 const settings={access:'people',settings:'project','settings-project':'project','settings-query':'query','settings-discovery':'discovery','settings-evidence':'evidence','settings-agents':'people','settings-engines':'engines','token-key':'token'};
 if(Object.hasOwn(settings,screen)){q.set('section',settings[screen]);return next('settings');}
 return null;
}
export function consoleLink(href){return href.startsWith('?')||href.startsWith('#')?href:consoleDestination(href)??href;}
