import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

/** Only the shared frame's alpha is needed at runtime, not its original colours. */
export const buildFinishMask = async (): Promise<void> => {
  const { data, info } = await sharp(fileURLToPath(new URL('./templates/genesis-frame.png', import.meta.url)))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = 255;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ lossless: true })
    .toFile(fileURLToPath(new URL('../../src/assets/images/card-frame-mask.webp', import.meta.url)));
};
