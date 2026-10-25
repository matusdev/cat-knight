// Игра лежит в assets/game.html (scripts/sync-game.cjs) — Metro должен считать .html ресурсом, а не кодом
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('html');

module.exports = config;
