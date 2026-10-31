/** URL-owned screens and scopes; shared by routing and conformance coverage. */
export const screens=['home','activity','pools','data','settings'] as const;
export const settingsSections=['project','company','engines','custody','tls','mail','people','token','query','evidence','discovery'] as const;
export const poolTabs=['access','credentials','agents'] as const;
export const dataTabs=['entitlements','sources','suggestions'] as const;
export const accountDialogs=['you','new-project'] as const;
export function screenFrom(search:string){const value=new URLSearchParams(search).get('screen');return screens.find(s=>s===value)??'home';}
