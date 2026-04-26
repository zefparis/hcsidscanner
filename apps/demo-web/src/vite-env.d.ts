/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNICAT_CLIENT_ID?: string;
  readonly VITE_SIGNICAT_BASE_URL?: string;
  readonly VITE_SIGNICAT_SCOPE?: string;
  readonly VITE_REDIRECT_URI?: string;
  readonly VITE_HCS_API_URL?: string;
  readonly VITE_HCS_TENANT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
