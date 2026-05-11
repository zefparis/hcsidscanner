type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => { json: (payload: unknown) => void };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.status(200).json({
      ok: true,
      method: req.method,
      hasBody: Boolean(req.body),
      env: {
        hasApiSecret: Boolean(process.env.API_SECRET),
        hasCorsOrigin: Boolean(process.env.CORS_ALLOWED_ORIGIN),
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
