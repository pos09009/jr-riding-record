# PWA 아이콘 생성기 (pygame 사용) — 한 번 실행하면 icon-192/512.png 생성
import pygame
pygame.init()

def make(size, fname):
    surf = pygame.Surface((size, size), pygame.SRCALPHA)
    # 둥근 사각 배경 (다크)
    r = int(size * 0.22)
    bg = pygame.Rect(0, 0, size, size)
    pygame.draw.rect(surf, (10, 14, 26, 255), bg, border_radius=r)
    # 시안 테두리
    pygame.draw.rect(surf, (0, 212, 255, 255), bg, width=max(2, size // 64), border_radius=r)
    # "JR" 텍스트
    font = pygame.font.SysFont("arialblack,arial", int(size * 0.42), bold=True)
    txt = font.render("JR", True, (0, 212, 255))
    surf.blit(txt, txt.get_rect(center=(size // 2, int(size * 0.40))))
    # "乗車" 텍스트 (작게, 주황)
    font2 = pygame.font.SysFont("yugothic,meiryo,msgothic,arial", int(size * 0.18))
    txt2 = font2.render("乗車", True, (255, 107, 53))
    surf.blit(txt2, txt2.get_rect(center=(size // 2, int(size * 0.72))))
    pygame.image.save(surf, fname)
    print("saved", fname)

make(192, "icon-192.png")
make(512, "icon-512.png")
pygame.quit()
