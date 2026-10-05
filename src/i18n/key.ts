/** Compact build-time catalogue keys. The generator rejects collisions before emitting any artefact. */
export function messageKey(source: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(36);
}
