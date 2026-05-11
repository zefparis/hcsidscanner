/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HCS_API_URL?: string;
  readonly VITE_HCS_TENANT_ID?: string;
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
