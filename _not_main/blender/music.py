# Музыка «Кот-рыцаря»: перекодирует MP3 в лёгкий MP3 для телефона (по умолчанию 96 кбит/с, стерео) через FFmpeg,
# встроенный в Blender (своего ffmpeg на машине нет). Звук кладётся в секвенсор пустой сцены и сводится целиком.
#
# Запуск из корня проекта:
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P _not_main/blender/music.py -- <папка с mp3> public/music [кбит/с]
import bpy, sys, os

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = os.path.abspath(args[0]), os.path.abspath(args[1])  # путь к файлу — абсолютный, иначе Blender не найдёт, куда писать
RATE = int(args[2]) if len(args) > 2 else 96
os.makedirs(OUT, exist_ok=True)

for name in sorted(os.listdir(SRC)):
    if not name.lower().endswith('.mp3'):
        continue
    scene = bpy.data.scenes.new('mix_' + name)
    bpy.context.window.scene = scene
    scene.render.fps = 25
    seq = scene.sequence_editor_create()
    strip = seq.strips.new_sound('track', os.path.join(SRC, name), 1, 1)
    scene.frame_start = 1
    scene.frame_end = strip.frame_final_end
    out = os.path.join(OUT, name.lower().replace(' ', '_'))
    bpy.ops.sound.mixdown(filepath=out, check_existing=False, relative_path=False, container='MP3', codec='MP3', format='S16', bitrate=RATE, split_channels=False)
    print('music:', name, '->', out, round(os.path.getsize(out) / 1048576, 2), 'MB', round(strip.frame_final_duration / scene.render.fps), 's')
