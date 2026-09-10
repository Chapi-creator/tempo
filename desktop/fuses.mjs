import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const electronExe = join(here, 'node_modules', 'electron', 'dist', 'electron.exe');

const fuses = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true
};

try {
  flipFuses(electronExe, { version: FuseVersion.V1, fuses });
  console.log('fuses aplicados: runAsNode off, nodeOptions off, cliInspect off, asar-only');
} catch (err) {
  console.error('fuses fallaron:', err.message);
  process.exit(1);
}