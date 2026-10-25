// Кладёт в приложение свежую игру: build/playable.html (один файл, модели внутри; собирается в _not_main: npx gulp playable)
// → mobile/assets/game.html, треки public/music/*.mp3 → mobile/assets/music (в playable их нет — приложение отдаёт игре пути к ним)
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..', 'build', 'playable.html');
const DST = path.join(__dirname, '..', 'assets', 'game.html');

if (!fs.existsSync(SRC)) {
  console.error('Нет ' + SRC + ' — соберите игру: cd _not_main && npx gulp playable');
  process.exit(1);
}
fs.mkdirSync(path.dirname(DST), { recursive: true });
fs.copyFileSync(SRC, DST);
console.log('игра → ' + DST + ' (' + (fs.statSync(DST).size / 1048576).toFixed(1) + ' МБ)');

const MUSIC = path.join(__dirname, '..', '..', 'public', 'music'), MDST = path.join(__dirname, '..', 'assets', 'music');
fs.mkdirSync(MDST, { recursive: true });
const tracks = fs.readdirSync(MUSIC).filter(f => f.endsWith('.mp3'));
tracks.forEach(f => fs.copyFileSync(path.join(MUSIC, f), path.join(MDST, f)));
console.log('музыка → ' + MDST + ' (' + tracks.length + ' треков)');
