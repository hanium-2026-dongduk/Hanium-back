#!/usr/bin/env bash
#
# EC2 최초 세팅 (Week 4 — 서버 첫 배포).
# Ubuntu 22.04/24.04 기준. 인스턴스를 새로 만든 뒤 **한 번만** 실행한다.
#
# 사용법:
#   ssh -i <키>.pem ubuntu@<EC2_퍼블릭_IP>
#   git clone https://github.com/hanium-2026-dongduk/Hanium-back.git ~/hanium-back
#   cd ~/hanium-back && bash deploy/setup-ec2.sh
#
# 이 스크립트가 하지 않는 것(직접 해야 함):
#   - .env 작성 (아래 안내가 나온다)
#   - RDS 보안그룹에 이 EC2를 허용
#   - 도메인 연결과 SSL 발급 (deploy/README.md 참고)

set -euo pipefail

NODE_MAJOR=22   # CI(.github/workflows/ci.yml)와 같은 버전으로 맞춘다
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }

log "시스템 패키지 갱신"
sudo apt-get update -y
sudo apt-get upgrade -y

log "Node.js ${NODE_MAJOR}.x 설치"
# Ubuntu 기본 저장소의 Node는 버전이 낮아 NodeSource를 쓴다.
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v && npm -v

log "빌드 도구 설치 (bcrypt 네이티브 모듈 컴파일에 필요)"
sudo apt-get install -y build-essential python3

log "Nginx 설치"
sudo apt-get install -y nginx
sudo systemctl enable --now nginx

log "certbot 설치 (SSL — 도메인이 생기면 사용)"
sudo apt-get install -y certbot python3-certbot-nginx

log "PM2 설치"
sudo npm install -g pm2
# 로그가 디스크를 채우지 않도록 회전시킨다. t2.micro의 8GB 디스크는 금방 찬다.
pm2 install pm2-logrotate || true
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

log "앱 의존성 설치"
cd "$APP_DIR"
mkdir -p logs
# devDependencies(jest, eslint 등)는 운영에 필요 없다.
npm ci --omit=dev

log "부팅 시 자동 기동 등록"
# 이 명령이 출력하는 `sudo env PATH=... pm2 startup systemd -u ...` 한 줄을 그대로 실행해야
# 실제로 등록된다. PM2가 sudo 없이 systemd를 건드릴 수 없어 이렇게 되어 있다.
pm2 startup systemd -u "$USER" --hp "$HOME" || true

cat <<'EOF'

────────────────────────────────────────────────────────────────
설치가 끝났습니다. 다음을 직접 해주세요.

1) 환경변수 작성
     cp .env.production.example .env
     nano .env
   - DB_HOST 에 RDS 엔드포인트
   - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 을 새로 생성한 값으로
       node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   - NODE_ENV=production 이면 JWT 시크릿이 비어 있을 때 서버가 뜨지 않습니다(의도된 동작).

2) RDS 보안그룹에 이 EC2 허용
     RDS → 보안 그룹 → 인바운드 규칙 → MySQL/Aurora(3306)
     소스: 이 EC2의 보안그룹 ID (IP가 아니라 보안그룹으로 여는 편이 안전합니다)

3) 마이그레이션 적용
     npm run migrate

4) 기동
     pm2 start ecosystem.config.js --env production
     pm2 save          # 현재 프로세스 목록을 저장해야 재부팅 후 복구됩니다
     curl localhost:3000/api/health

5) Nginx 연결
     sudo cp deploy/nginx.conf /etc/nginx/sites-available/hanium-api
     sudo ln -sf /etc/nginx/sites-available/hanium-api /etc/nginx/sites-enabled/
     sudo rm -f /etc/nginx/sites-enabled/default
     sudo nginx -t && sudo systemctl reload nginx

6) (도메인이 있다면) SSL
     deploy/nginx.conf 의 server_name 을 도메인으로 바꾼 뒤
     sudo certbot --nginx -d <도메인>

자세한 내용은 deploy/README.md 를 보세요.
────────────────────────────────────────────────────────────────
EOF
