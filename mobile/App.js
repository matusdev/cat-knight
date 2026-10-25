// «Кот-рыцарь: Небесный замок» — приложение-оболочка: игра (assets/game.html — тот же playable, что и в вебе)
// открыта в WebView на весь экран. Мост (в игре — frontend/js/native.js), сообщения — JSON { type, data }:
//   приложение → игра: tilt (наклон с датчиков, градусы как у deviceorientation), pause / resume (уход в фон);
//   игра → приложение: ready, haptic (вибрация, мс), telemetry (пачка аналитики — сюда подключить Firebase и т. п.);
//   приложение → игра после ready: music (пути к трекам — в game.html их нет, лежат в assets/music)
//   игра → приложение: ad (показать рекламу за спасение забега — ответ adDone { place, ok }), cloudSave (снимок
//   всех сохранений — в облако), leaderboard (результат забега дня); приложение → игра: cloudLoad (снимок с облака)
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { DeviceMotion } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';

const GAME = require('./assets/game.html');
// треки — те же имена, что MUSIC_TRACKS в игре (scripts/sync-game.cjs копирует их из public/music)
const MUSIC = {
  celtic_impulse: require('./assets/music/celtic_impulse.mp3'),
  master_of_the_feast: require('./assets/music/master_of_the_feast.mp3'),
  minstrel_guild: require('./assets/music/minstrel_guild.mp3'),
  achaidh_cheide: require('./assets/music/achaidh_cheide.mp3'),
  teller_of_the_tales: require('./assets/music/teller_of_the_tales.mp3')
};
const DEG = 180 / Math.PI;
// знак наклона «вбок» по платформам — на устройствах ещё не проверен: если кот рулит наоборот, поменять здесь
const GAMMA_SIGN = Platform.OS === 'android' ? 1 : 1;

export default function App() {
  const [uri, setUri] = useState(null);
  const web = useRef(null);
  const ready = useRef(false);
  useKeepAwake(); // экран не гаснет, пока играют наклоном

  useEffect(() => {
    Asset.fromModule(GAME).downloadAsync().then((a) => setUri(a.localUri || a.uri));
  }, []);

  const post = (type, data) => {
    if (ready.current && web.current) web.current.postMessage(JSON.stringify({ type, data: data || {} }));
  };

  // наклон: 60 раз в секунду, только когда игра ответила «ready»
  useEffect(() => {
    DeviceMotion.setUpdateInterval(16);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (rotation) post('tilt', { beta: rotation.beta * DEG, gamma: rotation.gamma * DEG * GAMMA_SIGN });
    });
    return () => sub.remove();
  }, []);

  // свернули приложение — игра на паузу и без звука
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => post(s === 'active' ? 'resume' : 'pause'));
    return () => sub.remove();
  }, []);

  const sendMusic = async () => {
    const names = Object.keys(MUSIC), assets = await Asset.loadAsync(names.map((n) => MUSIC[n]));
    const urls = {};
    names.forEach((n, i) => { urls[n] = assets[i].localUri || assets[i].uri; });
    post('music', { urls });
  };

  const onMessage = (e) => {
    let m;
    try { m = JSON.parse(e.nativeEvent.data); } catch (x) { return; }
    if (m.type === 'ready') {
      ready.current = true;
      sendMusic();
    } else if (m.type === 'haptic') {
      const ms = m.data.ms || 10;
      Haptics.impactAsync(ms <= 15 ? Haptics.ImpactFeedbackStyle.Light : ms <= 50 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
    } else if (m.type === 'telemetry') {
      if (__DEV__) console.log('telemetry', m.data.events.length, 'событий');
      // TODO: отправить в сервис аналитики (Firebase Analytics, GameAnalytics) — см. README
    } else if (m.type === 'ad') {
      // TODO: реклама за награду (react-native-google-mobile-ads, RewardedAd) — пока нет, игра сразу показывает финал
      post('adDone', { place: m.data.place, ok: false });
    } else if (m.type === 'cloudSave') {
      // TODO: сохранить снимок в облако (iCloud key-value / Google Play Games Saved Games); при входе — post('cloudLoad', { save })
      if (__DEV__) console.log('cloudSave', Object.keys(m.data.save || {}).length, 'ключей');
    } else if (m.type === 'leaderboard') {
      // TODO: таблица рекордов (Game Center / Google Play Games): m.data.board, m.data.score
      if (__DEV__) console.log('leaderboard', m.data.board, m.data.score);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {uri && (
        <WebView
          ref={web}
          source={{ uri }}
          originWhitelist={['*']}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf('/') + 1)}
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          webviewDebuggingEnabled={__DEV__}
          onMessage={onMessage}
          style={styles.root}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#7cc0ff' }
});
