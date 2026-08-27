export default async () => {
  return new Response(JSON.stringify({
    service: 'wings-of-athena',
    status: 'ok',
    runtime: 'netlify-functions',
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};
