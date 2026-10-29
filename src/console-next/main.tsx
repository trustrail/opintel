import React,{useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MotionConfig} from 'motion/react';
import {Tooltip} from './components/primitives.js';
import {useProjects,homeKeys} from './home/data.js';
import {Home,ListState} from './home/screen.js';
import {useHomeState} from './home/state.js';
import './styles.css';
const cache=new QueryClient({defaultOptions:{queries:{refetchOnWindowFocus:true,retry:false}}});
function App(){
 const projects=useProjects(),selected=useHomeState(s=>s.project),setSelected=useHomeState(s=>s.setProject),theme=useHomeState(s=>s.theme);
 useEffect(()=>{document.documentElement.setAttribute('data-console-theme',theme);},[theme]);
 const choose=(id:string)=>{cache.removeQueries({queryKey:homeKeys.allProjects()});setSelected(id);const url=new URL(window.location.href);url.searchParams.set('project',id);window.history.replaceState(null,'',url);};
 if(projects.isPending)return <ListState state="loading"/>;
 if(projects.isError)return <div data-project-empty><ListState state="error" error={projects.error} retry={()=>{void projects.refetch();}}/><a href="/sign-in">Sign in to the current console</a></div>;
 const project=projects.data.find(p=>p.id===selected)??projects.data[0];
 if(!project)return <div data-project-empty><h1>Welcome to Opintel</h1><p>Create your first project in the current console to get started.</p><a href="/projects">Open projects</a></div>;
 return <Home key={project.id} project={project} projects={projects.data} onProject={choose}/>;
}
const root=document.getElementById('console-next');if(!root)throw new Error('Missing console root.');
createRoot(root).render(<React.StrictMode><QueryClientProvider client={cache}><MotionConfig reducedMotion="user"><Tooltip.Provider delayDuration={300}><App/></Tooltip.Provider></MotionConfig></QueryClientProvider></React.StrictMode>);
