// Vercel serverless function entry point.
// Delegates to the actual handler in apps/demo-web/api/.
import handler from '../apps/demo-web/api/analyze-mrz';

export default handler;
