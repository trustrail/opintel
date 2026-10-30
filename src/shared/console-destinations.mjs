/* global URL, URLSearchParams */
/** Public URL compatibility only. Never authorizes access or reads application data. */
export function consoleDestination(href){
 const u=new URL(href,'http://console.invalid'),p=u.pathname,q=new URLSearchParams(u.search);
 if(p.startsWith('/dev/'))return '/legacy'+p+u.search;
 if(p==='/legacy'||p.startsWith('/legacy/'))return null;
 if(p==='/console-next'||p.startsWith('/console-next/'))return '/'+u.search+u.hash;
 if(['/sign-in','/check-email','/auth/callback','/auth/confirm-device','/settings','/companies/new','/projects/new'].includes(p)||p.startsWith('/companies/'))return '/legacy'+p+u.search+u.hash;
 const globals={'/dashboard':'','/activity':'activity','/data-sources':'data','/entitlements':'data','/pools':'pools','/access':'settings'};
 if(Object.hasOwn(globals,p)){const target=globals[p];if(target)q.set('screen',target);if(p==='/data-sources')q.set('tab','sources');if(p==='/access')q.set('section','people');return '/?'+q+u.hash;}
 if(p==='/projects')return q.has('companyId')?'/legacy'+p+u.search:'/'+u.search;
 const m=/^\/projects\/([^/]+)\/(.+)$/.exec(p);
 if(!m)return null;
 const project=m[1],screen=m[2];q.set('project',project);
 const next=(name)=>{if(name)q.set('screen',name);if(name==='data'&&q.has('sourceId')){q.set('source',q.get('sourceId'));q.delete('sourceId');}return '/?'+q+u.hash;};
 if(screen==='dashboard')return next('');
 if(screen==='activity'){
  if(q.has('poolId')){q.set('pool',q.get('poolId'));q.delete('poolId');}
  return next('activity');
 }
 const run=/^runs\/([^/]+)$/.exec(screen);
 if(run){q.set('run',run[1]);return next('activity');}
 if(screen==='pools')return next('pools');
 const pool=/^pools\/([^/]+)$/.exec(screen);
 if(pool){q.set('pool',pool[1]);return next('pools');}
 if(screen==='entitlements'){
  if(q.has('rowDecisionId')||q.get('rowFilter')==='unscoped')return '/legacy'+p+u.search+u.hash;
  if(q.has('rowObjectId')&&q.has('poolId')){q.set('pool',q.get('poolId'));q.set('rows',q.get('rowObjectId'));q.delete('poolId');q.delete('rowObjectId');return next('pools');}
  if(!q.has('decision')&&q.has('undecided'))q.set('decision',q.get('undecided')==='false'?'all':'undecided');q.delete('undecided');q.set('tab','entitlements');return next('data');
 }
 if(screen==='relationship-suggestions'){q.set('tab','suggestions');return next('data');}
 if(screen==='data-sources'){q.set('tab','sources');return next('data');}
 const settings={settings:'query','settings-project':'custody','settings-query':'query','settings-discovery':'discovery','settings-evidence':'evidence','settings-agents':'people','settings-engines':'engines','token-key':'token'};
 if(Object.hasOwn(settings,screen)&&!q.has('observationGroup')){q.set('section',settings[screen]);return next('settings');}
 return '/legacy'+p+u.search+u.hash;
}
export function consoleLink(href,legacyOnly=false){
 if(href.startsWith('?')||href.startsWith('#'))return href;
 if(legacyOnly&&!href.startsWith('/legacy/'))return '/legacy'+href;
 return consoleDestination(href)??href;
}
