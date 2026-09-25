declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
