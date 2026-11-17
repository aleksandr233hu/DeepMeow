"""从 resources/cat-mascot-master.png 生成 Android 图标与启动图（DeepMeow）。

猫是吉祥物（扁平矢量）渲染出的透明背景母版；图标用奶油白底 + 居中猫，
自适应图标按 72dp 安全区排版，旧系统图标与启动图见对应函数。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
MASCOT = ROOT / "resources" / "cat-mascot-master.png"

BACKGROUND = (25, 27, 32)
ICON_BACKGROUND = (250, 247, 242)
# 猫的内容高度占自适应图标 72dp 安全区的比例；三种启动器遮罩下都不会裁到耳朵
ICON_RATIO = 0.68
# 旧系统图标没有安全区，猫可以更大
LEGACY_RATIO = 0.72
# 启动图里猫的高度占屏幕短边的比例
SPLASH_RATIO = 0.36

# 猫在母版 96 单位视口中的内容包围盒（像素测量），用于裁到紧包围再等比缩放
MASCOT_VIEWBOX = 96.0
MASCOT_BBOX = (3.7, 12.0, 76.3, 77.0)

FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

MASTER = Image.open(MASCOT).convert("RGBA")


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise RuntimeError("No usable bold font found")


def mascot(target_height: int) -> Image.Image:
    """裁到猫的紧包围盒后按目标高度等比缩放，宽度随原比例。"""
    width, height = MASTER.size
    x0, y0, x1, y1 = MASCOT_BBOX
    box = (
        round(x0 / MASCOT_VIEWBOX * width),
        round(y0 / MASCOT_VIEWBOX * height),
        round(x1 / MASCOT_VIEWBOX * width),
        round(y1 / MASCOT_VIEWBOX * height),
    )
    tight = MASTER.crop(box)
    target_width = max(1, round(target_height * tight.width / tight.height))
    return tight.resize((target_width, target_height), Image.LANCZOS)


def compose(size: int, cat_height: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), ICON_BACKGROUND + (255,))
    cat = mascot(max(1, cat_height))
    canvas.alpha_composite(cat, ((size - cat.width) // 2, (size - cat.height) // 2))
    return canvas


def rounded(image: Image.Image, radius_ratio: float) -> Image.Image:
    size = image.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=255
    )
    result = image.copy()
    result.putalpha(mask)
    return result


def circle(image: Image.Image) -> Image.Image:
    size = image.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    result = image.copy()
    result.putalpha(mask)
    return result


def splash(path: Path) -> None:
    with Image.open(path) as current:
        width, height = current.size
    image = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(image)
    cat = mascot(int(min(width, height) * SPLASH_RATIO))
    center_x = width // 2
    center_y = int(height * 0.46)
    image.paste(cat, (center_x - cat.width // 2, center_y - cat.height // 2), cat)

    text = "DeepMeow"
    text_font = font(int(min(width, height) * 0.072))
    left, top, right, bottom = draw.textbbox((0, 0), text, font=text_font)
    draw.text(
        (
            center_x - (right - left) / 2 - left,
            center_y + cat.height // 2 + int(min(width, height) * 0.055),
        ),
        text,
        font=text_font,
        fill=(255, 255, 255),
    )
    image.save(path)


for density, size in LEGACY.items():
    base = RES / f"mipmap-{density}"
    icon = compose(size, round(size * LEGACY_RATIO))
    rounded(icon, 0.22).save(base / "ic_launcher.png")
    circle(icon).save(base / "ic_launcher_round.png")

for density, size in FOREGROUND.items():
    base = RES / f"mipmap-{density}"
    # 照片层即自适应图标背景：猫居中在 72/108 安全区内，四周奶油白
    icon = compose(size, round(size * 2 / 3 * ICON_RATIO))
    icon.save(base / "ic_launcher_photo.png")
    icon.save(base / "ic_launcher_foreground.png")

for path in RES.rglob("splash.png"):
    splash(path)

(RES / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    "<resources>\n"
    '    <color name="ic_launcher_background">#FAF7F2</color>\n'
    "</resources>\n",
    encoding="utf-8",
)

adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_photo"/>
    <foreground android:drawable="@android:color/transparent"/>
</adaptive-icon>
"""
for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
    (RES / "mipmap-anydpi-v26" / name).write_text(adaptive, encoding="utf-8")

print("DeepMeow cat icons and splash generated")
