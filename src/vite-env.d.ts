interface ImportMetaEnv {
  readonly VITE_STAKE_MINT?: string;
  readonly VITE_SNAPTAP_PROGRAM_ID?: string;
  readonly VITE_TXLINE_PROGRAM_ID?: string;
  readonly VITE_TXODDS_API_TOKEN?: string;
  readonly [key: string]: string | undefined;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
