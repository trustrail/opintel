import {Decimal} from 'decimal.js';
// A scalar in the catalogue has at most 38 decimal digits. Extra precision also
// covers exact binary64 values (including subnormals), without rounding them.
export const ExactDecimal=Decimal.clone({precision:1100,toExpNeg:-1100,toExpPos:1100});
