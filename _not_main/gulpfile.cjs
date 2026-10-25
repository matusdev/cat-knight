// gulpfile.js (CommonJS-стиль, Gulp 4)
// use node 22+
const fs = require('fs');
const path = require('path');
// Подтягиваем наши JSON-файлы (если нужно)
const p = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
// const pass = JSON.parse(fs.readFileSync('./pass.json', 'utf-8'));
// import zip from 'gulp-zip';
// Gulp и плагины
const { exec } = require('child_process');
const gulp = require('gulp');
const sass = require('gulp-sass')(require('sass'));
const autoprefixer = require('autoprefixer');
const rename = require('gulp-rename');
const pug = require('gulp-pug');
const cssnano = require('cssnano');
const postcss = require('gulp-postcss');

const browserSync = require('browser-sync').create();


const through2 = require('through2');
const replace = require('gulp-replace');

const { imageSize } = require('image-size');
const cheerio = require('cheerio'); 
const minimist = require('minimist');
const argv = minimist(process.argv.slice(2), {
  boolean: ['images', 'full'],
  alias: {
    i: 'images',
    f: 'full'
  }
});

// ------------------- serve -------------------
gulp.task('serve', function () {
  browserSync.init({
    server: {
      baseDir: '../'
    },
    port: 8080,
    notify: true,
    // npx gulp --https — гироскоп в мобильных браузерах работает только по https
    https: !!argv.https
  });

  gulp.watch('../frontend/pug/*.pug', gulp.series('pug'));
  gulp.watch('../frontend/scss/**/*.scss', gulp.series('sass'));
  gulp.watch('../frontend/js/**/*.js', gulp.series('js'));
});

// ------------------- pug -------------------
gulp.task('pug', function () {
  return gulp.src('../frontend/pug/*.pug')
    .pipe(pug({ pretty: true }))
    .pipe(gulp.dest('../'))
    .pipe(browserSync.stream());
});

gulp.task('pug_compile', function () {
  return gulp.src('../frontend/pug/*.pug')
    .pipe(pug({ pretty: true }))
    .pipe(gulp.dest('../compile/'));
});


// ------------------- sass -------------------
gulp.task('sass', function () {
  return gulp.src('../frontend/scss/main.scss')
  .pipe(sass({ quietDeps: true, quiet: true }).on('error', sass.logError))
  .pipe(postcss([
    autoprefixer(),
    cssnano({ preset: 'default' })
  ]))
  .pipe(rename('style.min.css'))
  .pipe(gulp.dest('../public/css/'))
  .pipe(browserSync.stream());
});

// ------------------- js -------------------
// ES-модули собирает esbuild: frontend/js/main.js + импорты (three из npm) → один public/js/main.min.js
const esbuild = require('esbuild');

function bundleJs() {
  return esbuild.build({
    entryPoints: [path.resolve(__dirname, '../frontend/js/main.js')],
    outfile: path.resolve(__dirname, '../public/js/main.min.js'),
    nodePaths: [path.resolve(__dirname, 'node_modules')], // исходники в ../frontend, а пакеты — здесь
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020', 'safari15'], // three r160+ работает только на WebGL2 — iOS 15+
    legalComments: 'none',
    define: { 'import.meta.url': 'document.baseURI' }, // KTX2Loader в модуле считает путь к транскодеру от import.meta.url — в iife его нет
    logLevel: 'warning'
  });
}

gulp.task('js', function () {
  return bundleJs().then(function () { if (browserSync.active) browserSync.reload(); });
});

gulp.task('js_compile', bundleJs);


/**************************************
 * Замена путей к WebP в HTML и CSS
 *************************************/
gulp.task('replace_img_paths', function () {
  const imgRegex = /(["'])public\/img\/(?:(\w+)\/)?([^/.]+)\.(?:jpe?g|png)\1/gi;

  function logReplacements() {
    return through2.obj(function (file, _, cb) {
      if (file.isBuffer()) {
        const contents = file.contents.toString();
        const matches = [...contents.matchAll(imgRegex)];
        if (matches.length > 0) {
          console.log(`📝 Файл: ${file.relative}`);
          matches.forEach(match => {
            const original = match[0];
            const converted = `public/img_convert/${match[2]}/${match[3]}.webp`;
            console.log(`  🔁 Заменено: ${original} → ${converted}`);
          });
        }
      }
      cb(null, file);
    });
  }

  return gulp.src(['../index.html', '../compile/*.html'], { base: '../' })
    .pipe(logReplacements())
    .pipe(replace(imgRegex, function (match, quote, folder, filename) {
      const path = folder
        ? `${quote}public/img_convert/${folder}/${filename}.webp${quote}`
        : `${quote}public/img_convert/${filename}.webp${quote}`;
      return path;
    }))
    .pipe(gulp.dest('../'));
});


/**************************************
 * Запуск imageConvert.js через exec
 *************************************/
gulp.task('webp', function(done) {
  exec('node imageConvert.js', function(err, stdout, stderr) {
    console.log(stdout);
    console.error(stderr);
    done(err);
  });
});


gulp.task('add_image_dimensions', function () {
  return gulp.src(['../index.html','../compile/index_metrika.html','../compile/index_volum.html'], { base: '../' })
    .pipe(through2.obj(function (file, _, cb) {
      if (!file.isBuffer() || !file.contents) {
        console.warn(`⚠️ Пропущен файл (не Buffer): ${file.relative}`);
        return cb(null, file);
      }

      let html;
      try {
        html = file.contents.toString('utf8');
      } catch (err) {
        console.error(`❌ Ошибка чтения файла: ${file.relative}`);
        return cb(err, file);
      }

      const $ = cheerio.load(html, { decodeEntities: false });
      let changed = false;

      $('img').each((_, img) => {
        const $img = $(img);
        const src = $img.attr('src');
        if (src && src.includes('/public/img/')) {
          const filePath = path.resolve(__dirname, '..', src.replace(/^\.\//, ''));
        
          try {
            if (fs.existsSync(filePath)) {
              const ext = path.extname(filePath).toLowerCase();
              if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
                console.warn(`⏭ Пропущено (неподдерживаемый формат): ${filePath}`);
                return;
              }
            
              const buffer = fs.readFileSync(filePath);
              const { width, height } = imageSize(buffer);
            
              if (width && height && (!$img.attr('width') || !$img.attr('height'))) {
                $img.attr('width', width);
                $img.attr('height', height);
                changed = true;
                console.log(`🖼  ${src} → ${width}x${height}`);
              }
            } else {
              console.warn(`⚠️ Файл не найден: ${filePath}`);
            }
          } catch (err) {
            console.error(`❌ Ошибка обработки ${filePath}: ${err.message}`);
          }
        }
      });

      if (changed) {
        try {
          file.contents = Buffer.from($.html());
        } catch (err) {
          return cb(err, file);
        }
      }

      cb(null, file);
    }))
    .pipe(gulp.dest('../'));
});




// ------------------- default -------------------
gulp.task('default', gulp.series('pug', 'sass', 'js', 'serve'));


// ------------------- pug_compile -------------------



gulp.task('replace_img_paths_with_picture', function () {
  return gulp.src(['../index.html', '../compile/*.html'], { base: '../' })
    .pipe(through2.obj(function (file, _, cb) {
      if (!file.isBuffer() || !file.contents) return cb(null, file);

      const html = file.contents.toString('utf8');
      const $ = cheerio.load(html, { decodeEntities: false });
      let changed = false;

      // Обрабатываем уже существующие <picture>
      $('picture').each((_, pictureEl) => {
        const $picture = $(pictureEl);
        const $img = $picture.find('img').first();
        if (!$img.length) return;

        let imgSrc = $img.attr('src');
        if (!imgSrc || (!imgSrc.includes('/public/img/') && !imgSrc.includes('/public/img_convert/'))) return;

        const ext = path.extname(imgSrc || '').toLowerCase();
        if (!['.jpg', '.jpeg', '.png'].includes(ext)) return; // SVG и прочее не трогаем

        // Восстановим оригинальный путь
        let originalSrc = imgSrc;
        if (imgSrc.includes('/img_convert/')) {
          originalSrc = imgSrc.replace('/img_convert/', '/img/').replace('.webp', '.png');
        }

        const webpImgSrc = originalSrc.replace('/img/', '/img_convert/').replace(/\.(jpg|jpeg|png)$/i, '.webp');

        // Обновляем src у <img> на оригинал
        $img.attr('src', originalSrc);

        // Добавляем десктопный webp <source>
        const newDesktopWebp = $('<source>')
          .attr('type', 'image/webp')
          .attr('srcset', webpImgSrc);
        const $lastMediaSource = $picture.find('source[media]').last();
        if ($lastMediaSource.length) {
          $lastMediaSource.after(newDesktopWebp); // вставляем после последних source[media]
        } else {
          $picture.prepend(newDesktopWebp); // если нет media, ставим в начало
        }

        // Обновляем source[media]
        $picture.find('source[media]').each((_, srcEl) => {
          const $src = $(srcEl);
          const srcset = $src.attr('srcset');
          if (!srcset) return;

          const fallbackSrc = srcset.includes('/img_convert/')
            ? srcset.replace('/img_convert/', '/img/').replace('.webp', '.png')
            : srcset;

          const webpSrc = fallbackSrc.replace('/img/', '/img_convert/').replace(/\.(jpg|jpeg|png)$/i, '.webp');

          const newWebpSource = $('<source>')
            .attr('media', $src.attr('media'))
            .attr('type', 'image/webp')
            .attr('srcset', webpSrc);

          $src.before(newWebpSource);

          const originalExt = path.extname(fallbackSrc).toLowerCase();
          const mimeType = originalExt.includes('png') ? 'image/png' : 'image/jpeg';
          $src.attr('type', mimeType);
          $src.attr('srcset', fallbackSrc);
        });

        changed = true;
      });

      // Обрабатываем <img> без <picture>
      $('img').each((_, imgEl) => {
        const $img = $(imgEl);
        const src = $img.attr('src');

        if (!src || (!src.includes('/public/img/') && !src.includes('/public/img_convert/'))) return;

        const ext = path.extname(src || '').toLowerCase();
        if (!['.jpg', '.jpeg', '.png'].includes(ext)) return;

        if ($img.parents('picture').length > 0) return; // Уже внутри <picture>

        const originalClass = $img.attr('class'); // Сохраняем класс
        $img.removeAttr('class'); // Убираем класс у img

        let originalSrc = src;
        if (src.includes('/img_convert/')) {
          originalSrc = src.replace('/img_convert/', '/img/').replace('.webp', '.png');
        }

        const webpSrc = originalSrc.replace('/img/', '/img_convert/').replace(/\.(jpg|jpeg|png)$/, '.webp');

        const picture = $('<picture></picture>');

        if (originalClass) {
          picture.addClass(originalClass); // Переносим класс на picture
        }

        picture.append(`<source type="image/webp" srcset="${webpSrc}">`);
        picture.append($img.clone().attr('src', originalSrc)); // клонируем img с правильным src

        $img.replaceWith(picture);

        changed = true;
      });

      if (changed) {
        file.contents = Buffer.from($.html());
      }

      cb(null, file);
    }))
    .pipe(gulp.dest('../'));
});


gulp.task('replace_background_fallbacks', function () {
  const bgRegex = /background(?:-image)?\s*:\s*(.*?url\([^)]+\).*?);/gi;

  return gulp.src('../public/css/*.css', { base: '../public' })
    .pipe(replace(bgRegex, function (match, urlPart) {
      const urlMatch = urlPart.match(/url\(['"]?(.*?)['"]?\)/i);

      if (!urlMatch) return match; // не найден url

      const originalUrl = urlMatch[1];
      if (!originalUrl.match(/^(\.\.\/)?img\//)) return match; // только наши картинки

      const webpUrl = originalUrl.replace(/^(\.\.\/)?img\//, '../img_convert/').replace(/\.(jpg|jpeg|png)$/i, '.webp');

      const firstBackground = `background${match.includes('background-image') ? '-image' : ''}: ${urlPart};`;
      const fallbackBackground = `background-image: url(${webpUrl});`;

      console.log(`🎨 Добавлен fallback для ${originalUrl}`);

      return `${firstBackground}\n${fallbackBackground}`;
    }))
    .pipe(gulp.dest('../public'));
});


gulp.task('compile', function (done) {
  const baseTasks = gulp.series('pug','pug_compile', 'sass', 'js_compile');

  if (argv.full || argv.images) {
    return gulp.series(
      baseTasks,
      'webp',
      'replace_img_paths_with_picture',  // СНАЧАЛА оборачиваем в <picture>
      'replace_img_paths',                // ПОТОМ заменяем пути
      'replace_background_fallbacks',
      'add_image_dimensions'
    )(done);
  } else {
    return gulp.series(
      baseTasks,
      'replace_img_paths_with_picture',  // СНАЧАЛА оборачиваем в <picture>
      'replace_img_paths',                // ПОТОМ заменяем пути
      'replace_background_fallbacks',
      'add_image_dimensions'
    )(done);
  }
});

/**************************************
 * Playable: один HTML-файл со встроенными CSS, JS, картинками и шрифтами
 * npx gulp playable  →  ../build/playable.html
 *************************************/
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.glb': 'model/gltf-binary',
  '.js': 'text/javascript', '.wasm': 'application/wasm'
};

function toDataUri(file) {
  const ext = path.extname(file).toLowerCase();
  return 'data:' + (MIME[ext] || 'application/octet-stream') + ';base64,' + fs.readFileSync(file).toString('base64');
}

gulp.task('playable_inline', function (done) {
  const root = path.resolve(__dirname, '..');
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  html = html.replace(/<link[^>]+href=["']\.?\/?(public\/css\/[^"']+)["'][^>]*>/g, function (m, href) {
    const css = fs.readFileSync(path.join(root, href), 'utf8')
      .replace(/url\((['"]?)\.\.\/((?:img|fonts)\/[^'")]+)\1\)/g, function (mm, q, rel) {
        return 'url(' + toDataUri(path.join(root, 'public', rel)) + ')';
      });
    return '<style>' + css + '</style>';
  });

  html = html.replace(/<script[^>]+src=["']\.?\/?(public\/js\/[^"']+)["'][^>]*><\/script>/g, function (m, src) {
    const js = fs.readFileSync(path.join(root, src), 'utf8')
      .replace(/(['"])(public\/(?:img|models|basis)\/[^'"]+)\1/g, function (mm, q, rel) { // картинки, модели и транскодер KTX2
        return q + toDataUri(path.join(root, rel)) + q;
      });
    return '<script>' + js.replace(/<\/script/gi, '<\/script') + '</script>';
  });

  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'playable.html'), html);
  console.log('🎮 build/playable.html — ' + (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + ' MB');
  done();
});

gulp.task('playable', gulp.series('pug', 'sass', 'js_compile', 'playable_inline'));
