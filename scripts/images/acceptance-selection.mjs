/** Selection never manufactures prerequisites: reuse requires a live, owned checkpoint. */
export function acceptanceSelection(args){
 let only,from,reuse,retain=false,baseline=false,ledger;
 const remaining=[];
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(['--only','--from','--reuse-run','--ledger'].includes(arg)){const value=args[++i];if(!value||value.startsWith('--'))throw new Error(arg+' requires a value');if(arg==='--only')only=value;else if(arg==='--from')from=value;else if(arg==='--reuse-run')reuse=value;else ledger=value;}
  else if(arg==='--retain-install')retain=true;else if(arg==='--baseline')baseline=true;else remaining.push(arg);
 }
 if(only&&from)throw new Error('Choose --only or --from, not both.');
 if(only&&only!=='custody,companion')throw new Error('Supported isolated selection: --only custody,companion');
 if(from&&from!=='soak')throw new Error('Supported continuation: --from soak');
 if((only||from)&&!reuse)throw new Error('Selected stages require --reuse-run DIR with a live install checkpoint.');
 if(reuse&&!only&&!from)throw new Error('--reuse-run requires an explicit stage selection.');
 if(baseline&&(only||from||retain))throw new Error('--baseline is one fresh soak/latency run, with setup prerequisites only.');
 return {remaining,reuse,retain,baseline,ledger,custody:!baseline&&from!=='soak',soak:!only,latency:!only,browser:!baseline&&!reuse,xq:!baseline&&!reuse,scope:baseline?'baseline':only??from??'full'};
}
