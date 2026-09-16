import { z } from 'zod';

export const requestLinkEmailSchema = z.string().email().max(320);
