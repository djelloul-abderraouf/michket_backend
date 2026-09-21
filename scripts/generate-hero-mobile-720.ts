import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import sharpModule = require('sharp');

type SharpFactory = (
  input?: string | Buffer,
  options?: {
    failOn?: 'none' | 'truncated' | 'error' | 'warning';
  },
) => any;

const sharp = sharpModule as unknown as SharpFactory;

const TARGET_WIDTH = 720;
const AVIF_QUALITY = 60;
const AVIF_EFFORT = 4;

const FILES = [
  'hero-carte-du-monde-tel.png',
  'hero-trophee-bac-tel.png',
  'hero-naissance-tel.png',
  'hero-mariage-tel.png',
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;

  return `${(kb / 1024).toFixed(2)} MB`;
}

async function main(): Promise<void> {
  /*
   * Le script est prévu pour être lancé depuis :
   * C:\Users\dz\Desktop\michket_v2\backend
   *
   * Les images source sont donc dans :
   * ..\public\images\hero
   */
  const heroDirectory = join(
    process.cwd(),
    '..',
    'public',
    'images',
    'hero',
  );

  console.log('');
  console.log('Generate 720px mobile Hero AVIFs');
  console.log('================================');
  console.log(`Source directory: ${heroDirectory}`);
  console.log('');

  for (const fileName of FILES) {
    const inputPath = join(heroDirectory, fileName);
    const outputName = fileName.replace(
      /\.png$/i,
      '-720.avif',
    );
    const outputPath = join(heroDirectory, outputName);

    const sourceStat = await stat(inputPath);

    const sourceMetadata = await sharp(inputPath, {
      failOn: 'error',
    }).metadata();

    if (
      !sourceMetadata.width ||
      !sourceMetadata.height
    ) {
      throw new Error(
        `Unable to read dimensions for ${fileName}.`,
      );
    }

    await sharp(inputPath, {
      failOn: 'error',
    })
      .rotate()
      .resize({
        width: TARGET_WIDTH,
        withoutEnlargement: true,
        fit: 'inside',
      })
      .avif({
        quality: AVIF_QUALITY,
        effort: AVIF_EFFORT,
      })
      .toFile(outputPath);

    const outputStat = await stat(outputPath);

    const outputMetadata = await sharp(outputPath, {
      failOn: 'error',
    }).metadata();

    if (
      !outputMetadata.width ||
      !outputMetadata.height
    ) {
      throw new Error(
        `Unable to verify output dimensions for ${outputName}.`,
      );
    }

    console.log(fileName);
    console.log(
      `  source: ${sourceMetadata.width}x${sourceMetadata.height} — ${formatBytes(sourceStat.size)}`,
    );
    console.log(
      `  output: ${outputMetadata.width}x${outputMetadata.height} — ${formatBytes(outputStat.size)}`,
    );
    console.log(`  -> ${outputName}`);
    console.log('');
  }

  console.log('Done.');
  console.log(
    'The original PNG/AVIF files were not modified or deleted.',
  );
}

void main();
