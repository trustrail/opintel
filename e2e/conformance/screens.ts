import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {navGroups} from '../../src/app/navigation.js';

/** Derived from routing, not a hand-maintained sample of screens. A new literal
 * route or drawer destination makes the coverage gate require another visit. */
export function screenPaths():string[]{
 const source=ts.createSourceFile('router.tsx',readFileSync(new URL('../../src/app/router.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const paths=new Set<string>();
 const visit=(node:ts.Node)=>{
  if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='path'&&ts.isStringLiteral(node.initializer))paths.add(node.initializer.text);
  if(ts.isBinaryExpression(node)&&node.left.getText(source)==='screen'&&ts.isStringLiteral(node.right))paths.add(`/projects/$projectId/${node.right.text}`);
  ts.forEachChild(node,visit);
 };visit(source);
 paths.delete('/'); // redirect to /projects, not a screen
 paths.delete('/projects/$projectId/$screen');
 for(const group of navGroups)for(const item of group.items){
  paths.add(item.path);
  if(item.path!=='/projects')paths.add(`/projects/$projectId${item.path}`);
  for(const child of item.children??[])paths.add(`/projects/$projectId/${child.screen}`);
 }
 return [...paths].sort();
}
export function matchesScreen(pattern:string,path:string):boolean{
 const a=pattern.split('/'),b=path.split('/');return a.length===b.length&&a.every((part,index)=>part.startsWith('$')?Boolean(b[index]):part===b[index]);
}
