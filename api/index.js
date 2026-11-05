import app from '../server.js';

export default async function handler(req, res) {
  try {
    // 1. Universal CORS headers so client on Vercel or any origin never fails
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-visitor-id, x-admin-key, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // 2. Reconstruct original subpath if rewritten by Vercel
    const subpath = req.query?.__subpath || req.query?.path;
    if (subpath) {
      const cleanSub = Array.isArray(subpath) ? subpath.join('/') : String(subpath);
      const parsedUrl = new URL(req.url, 'http://localhost');
      parsedUrl.pathname = ('/api/' + cleanSub).replace(/\/+/g, '/');
      parsedUrl.searchParams.delete('__subpath');
      parsedUrl.searchParams.delete('path');
      const search = parsedUrl.searchParams.toString();
      req.url = parsedUrl.pathname + (search ? `?${search}` : '');
    } else {
      const matched = req.headers['x-matched-path'];
      if (matched && matched.startsWith('/api/') && (req.url === '/api' || req.url === '/' || req.url === '')) {
        req.url = matched;
      }
    }

    // 3. Delegate to Express app
    return app(req, res);
  } catch (err) {
    console.error("Vercel Serverless Invocation Error:", err);
    return res.status(200).json({
      success: false,
      fallback: true,
      error: err.message || "Serverless execution recovered"
    });
  }
}
