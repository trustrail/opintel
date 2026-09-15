export const defaultPageLimit = 50;
export const maximumPageLimit = 500;

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface CursorPagination {
  readonly cursor?: string;
  readonly limit: number;
  readonly warning?: string;
}

export function cursorPagination(cursor: string | undefined, requestedLimit: number | undefined): CursorPagination {
  if (requestedLimit === undefined) return cursor === undefined ? { limit: defaultPageLimit } : { cursor, limit: defaultPageLimit };

  if (requestedLimit > maximumPageLimit) {
    return {
      ...(cursor === undefined ? {} : { cursor }),
      limit: maximumPageLimit,
      warning: `Requested limit was clamped to ${maximumPageLimit}.`,
    };
  }

  return cursor === undefined ? { limit: requestedLimit } : { cursor, limit: requestedLimit };
}
