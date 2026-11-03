/** scripts/app-version.mjs 的类型（vite.config.ts 和单测里用）。 */
export declare const PLATFORMS: readonly ['macos', 'windows', 'linux', 'android', 'ios'];
export type Platform = (typeof PLATFORMS)[number];
export interface TagParts {
  base: string;
  major: number;
  minor: number;
  patch: number;
  pre: string;
  build: number;
}
export interface ResolvedVersion {
  isTag: boolean;
  base: string;
  pre: string;
  build: number;
  display: string;
  sha: string;
  parts: TagParts;
}
export declare function parseTag(tag: string | null | undefined): TagParts | null;
export declare function preNumber(pre: string): number;
export declare function resolveVersion(input: { tag?: string | null; sha?: string | null; baseVersion: string }): ResolvedVersion;
export declare function androidVersionCode(v: ResolvedVersion): number;
export declare function nativeOverlay(platform: string, v: ResolvedVersion): Record<string, unknown>;
export declare function mergePatch(target: unknown, patch: unknown): unknown;
export declare function versionFromEnv(env: Record<string, string | undefined>, baseVersion: string, gitSha?: () => string): ResolvedVersion;
export declare function localGitSha(): string;
export declare function baseVersionFromConf(): string;
