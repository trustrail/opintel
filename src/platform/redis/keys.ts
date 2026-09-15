export type RedisKey<Prefix extends string> = `${Prefix}:${string}`;

export interface RedisKeyPrefix<Prefix extends string> {
  readonly prefix: Prefix;
  key(suffix: string): RedisKey<Prefix>;
}

export function redisKeyPrefix<const Prefix extends string>(prefix: Prefix): RedisKeyPrefix<Prefix> {
  return {
    prefix,
    key(suffix: string): RedisKey<Prefix> {
      return `${prefix}:${suffix}`;
    },
  };
}
