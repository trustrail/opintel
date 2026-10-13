/** Refuse development targets before a test opens a connection or resets data. */
function host(value:string):string {
 const name=value.toLowerCase().replace(/^\[|\]$/gu,'').replace(/\.$/u,'');
 return name==='localhost'||name==='localhost.localdomain'||name==='::1'||name==='0.0.0.0'||name.startsWith('127.')||name.startsWith('::ffff:127.')?'loopback':name;
}
export function assertTestDatabase(target:string,development?:string):void {
 const url=new URL(target);
 // libpq/pg query parameters can override the authority/path. Do not allow a
 // second routing configuration to defeat this check.
 for(const key of url.searchParams.keys())if(['host','hostaddr','port','database','dbname','service','connectionString'].includes(key))throw new Error('Test database URL must not contain routing overrides.');
 const database=decodeURIComponent(url.pathname.slice(1));
 // A dedicated test name also prevents DNS aliases from reaching the dev DB.
 const parts=database.toLowerCase().split('_');
 if(database.toLowerCase()==='opintel'||parts.some(part=>['dev','development','prod','production'].includes(part)))throw new Error('Refusing a development or production database name.');
 if(!parts.includes('test'))throw new Error('Test database must contain test as an underscore-delimited segment; refusing a non-test target.');
 // Compare the development database name independently of its hostname: a DNS
 // alias must not bypass the fence, even when the dev name includes "test".
 if(development){const dev=new URL(development);if(database===decodeURIComponent(dev.pathname.slice(1)))throw new Error('TEST_DATABASE_URL must name a different database from DATABASE_URL.');}
}
export function assertTestSpiceDb(endpoint:string):void {
 const url=new URL('http://'+endpoint);
 // Owned test instances use dynamic loopback ports. The shipping-image proof
 // uses this fixed, isolated Docker address. Never accept arbitrary DNS names:
 // their resolution can alias the development service (including after a check).
 const proof=url.hostname==='172.30.84.12'&&url.port==='50051';
 const owned=host(url.hostname)==='loopback'&&url.port!==''&&url.port!=='50051';
 if(!proof&&!owned)throw new Error('Refusing non-owned SpiceDB target. Use an owned loopback test port (never 50051) or the isolated ephemerality datastore.');
}
