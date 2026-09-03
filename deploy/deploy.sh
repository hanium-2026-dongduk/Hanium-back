#!/usr/bin/env bash
#
# 재배포 (Week 4 — 서버 첫 배포 이후).
# EC2에서 실행한다. 최초 세팅은 deploy/setup-ec2.sh 를 먼저 돌린 뒤다.
#
# 사용법:
#   cd ~/hanium-back && bash deploy/deploy.sh [브랜치]
#   (기본 브랜치: main)
#
# 하는 일: 코드 받기 → 의존성 설치 → 마이그레이션 → 무중단 재시작 → 헬스체크
#
# 마이그레이션을 재시작 **앞에** 두는 이유: 새 코드가 기대하는 컬럼이 없는 상태로 먼저
# 뜨면 그 사이 요청이 전부 실패한다. 이 저장소의 마이그레이션은 전부 추가(add) 성격이라
# 옛 코드가 새 스키마에서도 문제없이 돈다.

set -euo pipefail

BRANCH="${1:-main}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="hanium-api"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1"; exit 1; }

cd "$APP_DIR"

[[ -f .env ]] || fail ".env 가 없습니다. .env.production.example 을 복사해 채우세요."

log "코드 받기 ($BRANCH)"
git fetch origin "$BRANCH"
# 로컬 변경이 있으면 멈춘다 — 서버에서 직접 고친 내용을 조용히 날리지 않기 위해.
git diff --quiet || fail "커밋되지 않은 변경이 있습니다. 확인 후 다시 실행하세요."
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

log "의존성 설치"
npm ci --omit=dev

log "마이그레이션 적용"
npm run migrate

log "무중단 재시작"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  # reload는 워커를 하나씩 교체한다. wait_ready 덕분에 새 워커가 준비된 뒤에 다음으로 넘어간다.
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.js --env production
fi
pm2 save

log "헬스체크"
for i in $(seq 1 15); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    printf '\033[1;32m✓ 배포 완료\033[0m\n'
    pm2 list
    exit 0
  fi
  sleep 2
done

fail "헬스체크 실패. 로그를 확인하세요: pm2 logs $APP_NAME --lines 50"
