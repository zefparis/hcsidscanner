type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => { json: (payload: unknown) => void };
  setHeader: (name: string, value: string) => void;
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'method_not_allowed',
      message: 'Only POST is accepted.',
    });
    return;
  }

  const apiUrl =
    process.env.HCS_API_URL ??
    process.env.VITE_HCS_API_URL ??
    process.env.RAILWAY_API_URL;

  if (!apiUrl) {
    res.status(500).json({
      error: 'server_misconfigured',
      message: 'HCS_API_URL or VITE_HCS_API_URL is required.',
    });
    return;
  }

  try {
    const upstream = await fetch(
      `${apiUrl.replace(/\/$/, '')}/api/analyze-mrz`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(headerValue(req.headers['x-api-key'])
            ? { 'x-api-key': headerValue(req.headers['x-api-key']) as string }
            : {}),
        },
        body: JSON.stringify(req.body ?? {}),
      },
    );
    const data = await upstream.json().catch(() => ({
      error: 'upstream_parse_error',
      message: 'Could not parse upstream response.',
    }));
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[analyze-mrz-proxy]', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(502).json({
      error: 'upstream_unavailable',
      message: 'MRZ backend is unavailable.',
    });
  }
}
