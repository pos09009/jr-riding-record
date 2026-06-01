# PWA 아이콘 생성기 v2 — JR 공식 로고 이미지(jr-logo.png)를 합성
# 사용법: 같은 폴더에 jr-logo.png(흰 JR 로고)를 두고 실행
import pygame, os, sys
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
pygame.init()
pygame.display.set_mode((1, 1))

BG    = (10, 14, 26, 255)    # #0a0e1a  다크 배경
WHITE = (255, 255, 255, 255) # 테두리 / JR 마크
RED   = (255, 107, 53, 255)  # 乗車 색 (기존 유지)

LOGO_SRC = "jr-logo.png"
if not os.path.exists(LOGO_SRC):
    print("ERROR: jr-logo.png 파일이 폴더에 없습니다. 먼저 저장해주세요.")
    sys.exit(1)

# ── 로고 이미지에서 흰색 마크만 추출 (회색 배경 → 투명) ──
def extract_white(path):
    img = pygame.image.load(path).convert_alpha()
    w, h = img.get_size()
    out = pygame.Surface((w, h), pygame.SRCALPHA)
    img.lock(); out.lock()
    for y in range(h):
        for x in range(w):
            r, g, b, a = img.get_at((x, y))
            lum = 0.299 * r + 0.587 * g + 0.114 * b  # 밝기
            # 밝을수록(흰 글씨) 불투명, 어두울수록(배경) 투명 — 안티앨리어싱 보존
            alpha = max(0, min(255, int((lum - 70) * 255 / (255 - 70))))
            out.set_at((x, y), (255, 255, 255, alpha))
    img.unlock(); out.unlock()
    # 흰 마크의 실제 영역만 잘라내기 (여백 제거)
    bb = out.get_bounding_rect()
    return out.subsurface(bb).copy()

logo = extract_white(LOGO_SRC)

# ── 굵게 렌더링 (faux-bold: 살짝 겹쳐 찍기) ──
def render_bold(font, text, color):
    base = font.render(text, True, color)
    bw, bh = base.get_width() + 3, base.get_height() + 3
    s = pygame.Surface((bw, bh), pygame.SRCALPHA)
    for dx, dy in [(0,0),(1,0),(2,0),(0,1),(1,1),(2,1),(1,2)]:
        s.blit(font.render(text, True, color), (dx, dy))
    return s.subsurface(s.get_bounding_rect()).copy()

def make(size, fname):
    surf = pygame.Surface((size, size), pygame.SRCALPHA)
    r = int(size * 0.22)
    rect = pygame.Rect(0, 0, size, size)
    pygame.draw.rect(surf, BG, rect, border_radius=r)
    # 흰색 테두리 (또렷하게)
    bw = max(3, size // 22)
    inset = pygame.Rect(bw // 2, bw // 2, size - bw, size - bw)
    pygame.draw.rect(surf, WHITE, inset, width=bw, border_radius=int(r * 0.9))
    # JR 로고 (상단 중앙, 가로 폭 ~62%)
    target_w = int(size * 0.62)
    scale = target_w / logo.get_width()
    logo_s = pygame.transform.smoothscale(
        logo, (target_w, int(logo.get_height() * scale)))
    surf.blit(logo_s, logo_s.get_rect(center=(size // 2, int(size * 0.42))))
    # 乗車 (하단, 빨강, 굵게)
    font = pygame.font.SysFont(
        "yugothicuibold,yugothic,meiryo,msgothic,malgungothic,arial",
        int(size * 0.19), bold=True)
    t2 = render_bold(font, "乗車", RED)
    surf.blit(t2, t2.get_rect(center=(size // 2, int(size * 0.76))))
    pygame.image.save(surf, fname)
    print("saved", fname)

make(192, "icon-192.png")
make(512, "icon-512.png")
pygame.quit()
