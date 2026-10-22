/* Prayer Times — static PWA served from Workers static assets.
   SPA-ish safety net: hash-routed app, unknown paths fall back to index.html. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404) {
      return env.ASSETS.fetch(new Request(new URL('/', url)));
    }
    return res;
  },
};
