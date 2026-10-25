// Сжатие текстур моделей в KTX2 (Basis Universal). Цвет, свечение и прочее — ETC1S (маленькие файлы), карты нормалей —
// UASTC с zstd (без «кубиков» на рельефе). В видеопамяти текстуры остаются сжатыми — в 4–8 раз меньше, чем PNG,
// и на телефоне не вытесняют друг друга. Игра читает их через KTX2Loader (main.js, ktx2Ready).
// Исходник с PNG (как его выдаёт Blender) сохраняется в _not_main/models-png — повторный запуск берёт его оттуда.
// Запуск из _not_main: node ktx2.mjs [имя …]   (без имён — все модели public/models/*.glb)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'public', 'models'), PNG = path.join(ROOT, '_not_main', 'models-png');
const names = process.argv.slice(2);

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(PNG, { recursive: true });

const files = fs.readdirSync(MODELS).filter((f) => f.endsWith('.glb') && (!names.length || names.includes(f.replace('.glb', ''))));
for (const f of files) {
  const dst = path.join(MODELS, f), src = path.join(PNG, f);
  const doc = await io.read(dst);
  const hasPng = doc.getRoot().listTextures().some((t) => t.getMimeType() !== 'image/ktx2');
  if (hasPng) fs.copyFileSync(dst, src); // свежий вывод Blender — он и есть исходник
  else if (!fs.existsSync(src)) { console.log(f + ': уже KTX2, исходника нет — пропуск'); continue; }
  const doc2 = await io.read(src), before = fs.statSync(src).size, t0 = Date.now();
  await doc2.transform(
    process.env.NORMAL === 'uastc' // нормали: UASTC — точнее, но файл вдвое больше; по умолчанию ETC1S с настройкой под нормали
      ? ktx2({ slots: /normalTexture/, isUASTC: true, isNormalMap: true, isPerceptual: false, needSupercompression: true, generateMipmap: true, imageDecoder })
      : ktx2({ slots: /normalTexture/, isUASTC: false, isNormalMap: true, qualityLevel: 255, compressionLevel: 2, isPerceptual: false, generateMipmap: true, imageDecoder }),
    ktx2({ slots: /^(?!normalTexture)/, isUASTC: false, qualityLevel: 180, compressionLevel: 2, isPerceptual: true, isSetKTX2SRGBTransferFunc: true, generateMipmap: true, imageDecoder })
  );
  await io.write(dst, doc2);
  const after = fs.statSync(dst).size, tex = doc2.getRoot().listTextures().map((t) => t.getMimeType().replace('image/', '')).join(',');
  console.log(f + ': ' + (before / 1048576).toFixed(2) + ' → ' + (after / 1048576).toFixed(2) + ' МБ, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с [' + tex + ']');
}
