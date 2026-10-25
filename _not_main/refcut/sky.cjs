// Небо меню и лавки — из чистых картинок (refcut/menu-sky.png, refcut/shop-sky.png; без стёртого интерфейса),
// в размерах прежних вырезок — вдвое крупнее кадров макета (меню 1500×739, лавка 1785×881), Ланцош-3, JPEG 86.
// У лавки картинка 16:9, а кадр 2.03:1 — снизу срезаются облака до пропорций кадра (низ кадра и так тает в дымке).
// Из _not_main: node refcut/sky.cjs refcut ../public/img
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const [SRC, OUT] = process.argv.slice(2);

(async () => {
  await sharp(path.join(SRC, 'menu-sky.png')).resize(3000, 1478, { fit: 'fill', kernel: 'lanczos3' })
    .jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(OUT, 'menu-sky.jpg'));

  const m = await sharp(path.join(SRC, 'shop-sky.png')).metadata();
  const h = Math.min(m.height, Math.round(m.width * 881 / 1785));
  await sharp(path.join(SRC, 'shop-sky.png')).extract({ left: 0, top: 0, width: m.width, height: h })
    .resize(3570, 1762, { fit: 'fill', kernel: 'lanczos3' })
    .jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(OUT, 'shop-sky.jpg'));

  for (const n of ['menu-sky.jpg', 'shop-sky.jpg']) {
    const mm = await sharp(path.join(OUT, n)).metadata();
    console.log(n, mm.width + '×' + mm.height, Math.round(fs.statSync(path.join(OUT, n)).size / 1024) + ' KB');
  }
})();
