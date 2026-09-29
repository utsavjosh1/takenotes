import type { FuseVersion, FuseV1Options } from "@electron/fuses";

export declare const FUSE_CONFIG: Record<string, unknown> & {
  version: FuseVersion;
  strictlyRequireAllFuses: boolean;
  [FuseV1Options.RunAsNode]: boolean;
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: boolean;
};
export declare function packagedBinaryPath(
  appOutDir: string,
  electronPlatformName: string,
  productFilename: string,
): string;
declare const afterPack: (context: unknown) => Promise<void>;
export default afterPack;
