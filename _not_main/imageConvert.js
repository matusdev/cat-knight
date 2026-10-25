import fs from 'fs';
import path from 'path';
import { globby } from 'globby';
import imagemin from 'imagemin';
import imageminWebp from 'imagemin-webp';

const imgBase = '../public/img/';
const outBase = '../public/img_convert/';

// ✅ Сначала — обработка файлов в самом корне img/
const rootFiles = await globby(`${imgBase}*.{jpg,jpeg,png,JPG,JPEG,PNG}`);
if (rootFiles.length > 0) {
  console.log(`📂 Корень папки img/ — найдено ${rootFiles.length} файлов`);
  rootFiles.forEach(f => console.log(' -', f));

  await imagemin(rootFiles, {
    destination: outBase,
    plugins: [imageminWebp({ quality: 95 })]
  });

  console.log(`✔ Конвертировано файлов из корня: ${rootFiles.length}`);
}

// 🔁 Далее — обработка подпапок
const folders = fs.readdirSync(imgBase, { withFileTypes: true })
  .filter(d => d.isDirectory());

for (const folder of folders) {
  const inputPattern = `${imgBase}${folder.name}/**/*.{jpg,jpeg,png,JPG,JPEG,PNG}`;
  const outputFolder = `${outBase}${folder.name}`;

  const files = await globby(inputPattern);

  console.log(`📂 ${folder.name} — найдено ${files.length} файлов`);
  if (files.length > 0) {
    files.forEach(f => console.log(' -', f));
    await imagemin(files, {
      destination: outputFolder,
      plugins: [imageminWebp({ quality: 95 })
    ]});
    console.log(`✔ Конвертировано в WebP: ${files.length} файлов в ${outputFolder}`);
  }
}

console.log('✅ Все изображения обработаны!');