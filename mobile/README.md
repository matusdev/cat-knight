# Кот-рыцарь — приложение (Expo)

Оболочка для App Store и Google Play: игра — тот же `build/playable.html` (один файл, модели внутри), открытый в WebView на весь экран. Нативная часть даёт то, что в WebView работает плохо или по-разному на iOS и Android:

| | Как сделано |
|---|---|
| Наклон | датчики приложения (`expo-sensors`, DeviceMotion, 60 раз/с) → сообщение `tilt` в игру; игра кладёт его в тот же обработчик, что и `deviceorientation`. Разрешений iOS на ориентацию в WebView не нужно |
| Вибрация | игра шлёт `haptic` → `expo-haptics` (лёгкий / средний / сильный отклик по длительности) |
| Сворачивание | `AppState` → `pause` / `resume`: игра встаёт на паузу, звук гаснет |
| Экран | не гаснет во время игры (`expo-keep-awake`), только портрет, без статус-бара |
| Аналитика | игра отдаёт пачки событий `telemetry` приложению — сюда подключается Firebase Analytics или GameAnalytics (в `App.js` — TODO) |
| Сохранения | localStorage внутри WebView — сохраняется между запусками |
| Музыка | треки из `assets/music` — приложение передаёт игре их пути (`music`) |

Мост в игре — `frontend/js/native.js`; в браузере его нет, игра работает как раньше.

## Запуск

Нужны Node 20+ и телефон с Expo Go (или эмулятор).

```
cd _not_main && npx gulp playable      # собрать игру одним файлом → build/playable.html
cd ../mobile
npm install
npm start                               # скопирует игру в assets/game.html и запустит Expo; QR-код — в Expo Go
```

`npm run sync-game` — только скопировать свежую игру. Иконка и заставка снимаются движком игры: `node scripts/icon.cjs` (черновые; к релизу лучше нарисованная иконка).

## Сборка для сторов (EAS)

```
npm install -g eas-cli
eas login
eas build --platform android --profile preview    # APK для теста на телефоне
eas build --platform ios --profile preview        # нужен Apple Developer аккаунт
eas build --platform all --profile production     # для публикации
eas submit --platform all
```

## Перед первой сборкой

- **Идентификатор приложения**: в `app.json` стоит `com.example.catknight` — заменить на свой (например, `com.<компания>.catknight`) в `ios.bundleIdentifier` и `android.package`. После публикации он не меняется.
- **Знак наклона**: проверить на настоящих iPhone и Android, что кот рулит в нужную сторону; если наоборот — `GAMMA_SIGN` в `App.js`.
- **Аналитика**: выбрать сервис и отправлять в нём пачки из `onMessage` (`telemetry`); политику конфиденциальности (`_not_main/store/privacy.html`) дополнить его названием.
- **Музыка**: треки копируются в `assets/music` (`npm run sync-game`), приложение отдаёт игре пути к ним сообщением `music`. Новый трек — добавить и в `MUSIC_TRACKS` игры, и в `MUSIC` в `App.js`.
- **Размер**: игра ~15 МБ — для сторов это нормально (лимиты — сотни МБ).

## Версии

Expo SDK 58: expo ~58.0.19, react 19.3.0, react-native 0.88.0, react-native-webview 14.0.1 (по `expo/bundledNativeModules.json`). Обновление SDK — `npx expo install --fix`.
