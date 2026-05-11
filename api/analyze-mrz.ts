// Vercel serverless function entry point.
// Delegates to the actual handler in apps/demo-web/api/.
type VercelRequest = Parameters<
  typeof import('../apps/demo-web/api/analyze-mrz')['default']
>[0];
type VercelResponse = Parameters<
  typeof import('../apps/demo-web/api/analyze-mrz')['default']
>[1];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const mod = await import('../apps/demo-web/api/analyze-mrz');
  return mod.default(req, res);
}
