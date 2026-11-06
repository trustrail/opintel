export const gateTiers=['typecheck','typecheck:conformance','lint','build:production','test:conformance','test','test:smoke'];
export function gateSelection(args){
 if(args.length===0)return {scope:'full',scripts:[...gateTiers]};
 if(args.length!==2||args[0]!=='--from'||!gateTiers.includes(args[1]))throw new Error('Usage: npm run check [-- --from TIER]; TIER must name an existing gate tier.');
 return {scope:'resumed',from:args[1],scripts:gateTiers.slice(gateTiers.indexOf(args[1]))};
}
