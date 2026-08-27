/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WINGS_DEPLOY_CONTEXT?: string;
  readonly VITE_WINGS_DATA_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
