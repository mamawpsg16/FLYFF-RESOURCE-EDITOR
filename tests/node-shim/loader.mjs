export async function resolve(spec, ctx, next) {
  if (spec === 'gi://GLib') return { url: new URL('./glib.mjs', import.meta.url).href, shortCircuit: true };
  if (spec === 'system') return { url: new URL('./system.mjs', import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
