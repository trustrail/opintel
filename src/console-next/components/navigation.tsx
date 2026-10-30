import {DropdownMenu} from './primitives.js';
import {Glyph} from './kind.js';
import {useHomeState} from '../home/state.js';
import {needsAreas} from '../home/needs.js';
import type {NeedsYouItem} from '../../shared/api/needs-you.js';
const nav=[{name:'Home',icon:'home',path:''},{name:'Activity',icon:'activity',path:'/activity'},{name:'Pools',icon:'pool',path:'/pools'},{name:'Data',icon:'source',path:'/data-sources'},{name:'Settings',icon:'settings',path:'/settings-project'}] as const;
export function Navigation({project,active,needs}:{project:string;active:'Home'|'Pools'|'Data';needs:NeedsYouItem[]}){
 const theme=useHomeState(s=>s.theme),setTheme=useHomeState(s=>s.setTheme),attention=needsAreas(needs);
 return <aside data-rail><a data-logo href={`?project=${project}&theme=${theme}`} aria-label="Opintel Home"><Glyph name="logo" size={30}/></a><nav aria-label="Main navigation">{nav.map(n=><a key={n.name} href={n.name==='Data'?`?project=${project}&screen=data&theme=${theme}`:n.name==='Pools'?`?project=${project}&screen=pools&theme=${theme}`:n.path?`/projects/${project}${n.path}`:`?project=${project}&theme=${theme}`} aria-current={n.name===active?'page':undefined}><span><Glyph name={n.icon} size={23}/>{n.name==='Home'&&needs.length>0&&<i data-attention>{needs.length}</i>}{n.name!=='Home'&&attention[n.name]&&<i data-attention/>}</span><small>{n.name}</small></a>)}</nav><DropdownMenu.Root><DropdownMenu.Trigger data-profile aria-label="Account menu"><Glyph name="person"/></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content data-menu sideOffset={8}><DropdownMenu.Label>Account</DropdownMenu.Label><DropdownMenu.Item onSelect={()=>setTheme(theme==='light'?'dark':'light')}><Glyph name={theme==='light'?'moon':'sun'}/>Use {theme==='light'?'dark':'light'} theme</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></aside>;
}
