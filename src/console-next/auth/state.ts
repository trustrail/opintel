import {create} from 'zustand';
const returnKey='opintel.return_to',nonceKey='opintel.device_nonce',emailKey='opintel.auth_email';
export function rememberReturnTo(path:string|null,storage:Storage=localStorage){if(path?.startsWith('/')&&!path.startsWith('//'))storage.setItem(returnKey,path);}
export function completeReturnTo(storage:Storage=localStorage){const path=storage.getItem(returnKey);storage.removeItem(returnKey);return path?.startsWith('/')&&!path.startsWith('//')?path:'/';}
export function getDeviceNonce(storage:Storage=localStorage){const old=storage.getItem(nonceKey);if(old)return old;const bytes=crypto.getRandomValues(new Uint8Array(16));const nonce=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,'');storage.setItem(nonceKey,nonce);return nonce;}
export const useAuthState=create<{email:string;starting:string|null;setEmail:(email:string)=>void;start:(provider:string|null)=>void}>(set=>({email:typeof sessionStorage==='undefined'?'':sessionStorage.getItem(emailKey)??'',starting:null,setEmail:email=>{sessionStorage.setItem(emailKey,email);set({email});},start:starting=>set({starting})}));
export const authNavigation={go:(path:string)=>window.location.assign(path)};
export const authPaths=['/sign-in','/check-email','/auth/callback','/auth/confirm-device'];
export const isAuthPath=(path:string)=>authPaths.includes(path);
