import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { projectStreamCache } from './stream-cache.js';
export function useProjectStream(project: string | null): void {
 const cache = useQueryClient();
 useEffect(() => {
  if (!project) return;
  const consumer = projectStreamCache(cache, project);
  const stream = new EventSource(`/api/v1/projects/${project}/stream`);
  stream.onmessage = message => { try { consumer.receive(JSON.parse(message.data as string) as unknown); } catch { /* Never put malformed transport data in the cache. */ } };
  return () => { stream.close(); consumer.dispose(); };
 }, [cache, project]);
}
