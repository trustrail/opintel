/** Native transport codes only: no exception message, peer address or TLS material. */
export function transportFailureCode(error:unknown,fallback:string):string{
 if(error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/u.test(error.code))return error.code;
 return fallback;
}
