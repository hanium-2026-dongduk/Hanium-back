# 배포 가이드 (EC2 + PM2 + Nginx)

Week 4 Thu/Fri 작업. **EC2 생성부터 SSL까지** 순서대로 따라 하면 된다.

## 구성

```
인터넷 ──▶ Nginx (80/443) ──▶ PM2 클러스터 (127.0.0.1:3000) ──▶ RDS MySQL
              SSL 종료              워커 N개
```

앱은 3000번을 **localhost에만** 열고, 외부 노출은 Nginx가 맡는다. Node가 443을 직접 열려면
root 권한이 필요하고, 앱을 재시작하는 동안에도 Nginx는 살아 있어야 하기 때문이다.

| 파일 | 역할 |
| :--- | :--- |
| `deploy/setup-ec2.sh` | 최초 세팅 (Node·PM2·Nginx·certbot 설치) — **한 번만** |
| `deploy/deploy.sh` | 재배포 (코드 받기 → 마이그레이션 → 무중단 재시작) |
| `deploy/nginx.conf` | 리버스 프록시 설정 |
| `ecosystem.config.js` | PM2 설정 (클러스터·무중단 reload) |
| `.env.production.example` | 환경변수 템플릿 |

---

## 1. EC2 인스턴스 생성 (콘솔)

| 항목 | 값 | 이유 |
| :--- | :--- | :--- |
| AMI | Ubuntu Server 24.04 LTS | 스크립트가 apt 기준 |
| 인스턴스 유형 | `t2.micro` 또는 `t3.micro` | 프리티어 |
| 키 페어 | 새로 생성 (`.pem` 다운로드) | SSH 접속용. **다시 못 받는다** |
| 스토리지 | 8~16 GiB | 로그·node_modules 여유 |

**보안 그룹 인바운드**

| 유형 | 포트 | 소스 | 비고 |
| :--- | :--- | :--- | :--- |
| SSH | 22 | **내 IP** | `0.0.0.0/0`으로 열지 말 것 |
| HTTP | 80 | `0.0.0.0/0` | certbot 도메인 확인에도 필요 |
| HTTPS | 443 | `0.0.0.0/0` | SSL 붙인 뒤 |

> **3000번은 열지 않는다.** Nginx가 대신 받는다.

## 2. RDS 연결 허용

RDS → 해당 DB → 연결 및 보안 → VPC 보안 그룹 → 인바운드 규칙 편집

| 유형 | 포트 | 소스 |
| :--- | :--- | :--- |
| MySQL/Aurora | 3306 | **EC2의 보안그룹 ID** |

IP가 아니라 **보안그룹 ID로 여는 편이 안전**하고, EC2를 재시작해 IP가 바뀌어도 유지된다.

> RDS가 EC2와 **같은 VPC**에 있어야 한다. 다르면 퍼블릭 액세스를 켜거나 VPC 피어링이 필요하다.

## 3. 최초 세팅

```bash
ssh -i <키>.pem ubuntu@<EC2_퍼블릭_IP>

git clone https://github.com/hanium-2026-dongduk/Hanium-back.git ~/hanium-back
cd ~/hanium-back
bash deploy/setup-ec2.sh
```

스크립트가 Node 22, PM2(+로그 회전), Nginx, certbot을 설치하고 의존성까지 받는다.
마지막에 **`pm2 startup`이 출력하는 `sudo env PATH=... ` 한 줄을 그대로 복사해 실행**해야
재부팅 후 자동 기동이 등록된다.

## 4. 환경변수

```bash
cp .env.production.example .env
nano .env
```

`TRUST_PROXY=true`를 꼭 켠다 — Nginx 뒤에서 돌기 때문이다. 켜지 않으면 요청 제한이
**모든 요청을 Nginx 하나의 IP로 보고 전체 사용자를 함께 막는다.**

JWT 시크릿은 반드시 새로 만든다:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> `NODE_ENV=production`인데 JWT 시크릿이 비어 있으면 **서버가 아예 뜨지 않는다.**
> 개발용 기본값이 운영에 새는 것을 막는 의도된 동작이다(`src/config/env.js`).

## 5. 마이그레이션과 기동

```bash
npm run migrate      # 스키마 적용 (기존 데이터 보존)
pm2 start ecosystem.config.js --env production
pm2 save             # 이걸 해야 재부팅 후 복구된다
curl localhost:3000/api/health
```

`{"status":"ok"}`가 나오면 앱은 정상이다.

## 6. Nginx 연결

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/hanium-api
sudo ln -sf /etc/nginx/sites-available/hanium-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

이제 브라우저에서 `http://<EC2_퍼블릭_IP>/api/health`가 열린다.

## 7. 도메인과 SSL

**도메인이 없으면 이 단계는 건너뛴다.** HTTP로도 동작하며, 도메인이 생긴 뒤 언제든 붙일 수 있다.

1. 도메인 DNS에 A 레코드 추가 → EC2 퍼블릭 IP
   (Route 53을 쓴다면 호스팅 영역 → 레코드 생성)
2. `deploy/nginx.conf`의 `server_name _;`을 도메인으로 바꾸고 다시 복사·reload
3. 인증서 발급

```bash
sudo certbot --nginx -d api.example.com
sudo certbot renew --dry-run    # 자동 갱신이 실제로 되는지 확인
```

certbot이 443 블록 추가와 80→443 리다이렉트까지 알아서 해준다.

> **IP는 도메인이 아니라서 SSL을 붙일 수 없다.** Let's Encrypt는 IP에 인증서를 발급하지 않는다.

## 8. 재배포

이후 배포는 이 한 줄이다.

```bash
cd ~/hanium-back && bash deploy/deploy.sh main
```

코드 받기 → 의존성 → 마이그레이션 → **무중단 재시작** → 헬스체크까지 하고,
실패하면 0이 아닌 코드로 끝난다.

무중단이 되는 구조:
- PM2 `reload`가 워커를 하나씩 교체한다
- 새 워커는 `listen` 후 `process.send('ready')`를 보낸다 (`src/server.js`)
- PM2는 그 신호를 받고 나서 다음 워커로 넘어간다 (`wait_ready: true`)
- 옛 워커는 SIGINT를 받고 진행 중인 요청을 마친 뒤 DB 연결을 닫고 종료한다

## 9. GitHub Actions 자동 배포

`.github/workflows/deploy.yml`은 `main`의 CI가 전부 성공한 뒤 EC2에서 위 재배포
스크립트를 실행한다. GitHub 저장소의 **Settings → Environments → New environment**에서
`production`을 만들고 다음 Environment secrets를 등록한다.

| Secret | 값 |
| :--- | :--- |
| `EC2_HOST` | EC2 탄력적 IP 또는 퍼블릭 DNS |
| `EC2_USER` | Ubuntu AMI이면 `ubuntu` |
| `EC2_SSH_KEY` | `.pem` 파일의 시작/끝 줄을 포함한 전체 내용 |
| `EC2_KNOWN_HOSTS` | 신뢰할 수 있는 환경에서 확인한 EC2 SSH 호스트 키 |
| `EC2_SSH_PORT` | 선택 사항. 생략하면 `22` |

`.pem` 파일은 저장소에 복사하거나 커밋하지 않는다. GitHub Actions는 실행할 때만 Secret을
임시 키 파일로 만들며 작업이 끝나면 러너와 함께 폐기한다.

22번 포트를 본인 IP에 잠시 허용하고 최초 SSH 접속 때 표시되는 지문을 EC2 콘솔의 호스트
키와 대조한 다음, 아래 명령 결과를 `EC2_KNOWN_HOSTS`에 저장한다.

```bash
ssh-keyscan -H -p 22 <EC2_HOST>
```

워크플로 실행 중 새로 스캔한 키를 곧바로 신뢰하지 않고 이 값을 고정해서 중간자 공격을
탐지한다. 인스턴스를 재생성해 호스트 키가 바뀌면 다시 확인하고 Secret을 갱신해야 한다.

EC2 보안 그룹에서 GitHub-hosted runner의 유동 IP를 허용하기 어려우면 22번을 전 세계에
상시 개방하지 말고, self-hosted runner·AWS Systems Manager 같은 고정된 배포 경로로
전환해야 한다. 최초 서버 세팅과 `.env` 작성은 자동화 대상이 아니므로 한 번은 직접 해야 한다.

### 롤백

문제가 생긴 커밋의 바로 이전 정상 커밋 SHA를 GitHub에서 확인한 뒤 EC2에서 실행한다.

```bash
cd ~/hanium-back
bash deploy/deploy.sh <정상_커밋_SHA>
```

현재 마이그레이션은 기존 컬럼을 삭제하지 않는 추가형이라 이전 앱과 호환된다. 추후 파괴적
마이그레이션이 추가되면 DB 롤백 절차를 별도로 준비한 뒤 배포해야 한다. 다음 정상 배포 때는
다시 `main`으로 복귀한다.

---

## 자주 쓰는 명령

```bash
pm2 list                      # 상태
pm2 logs hanium-api --lines 50
pm2 monit                     # 실시간 CPU/메모리
pm2 reload hanium-api         # 무중단 재시작
pm2 restart hanium-api        # 강제 재시작 (환경변수 바꿨을 때)

sudo tail -f /var/log/nginx/error.log
sudo systemctl status nginx
```

## 문제가 생기면

| 증상 | 확인 |
| :--- | :--- |
| 502 Bad Gateway | 앱이 죽었다. `pm2 logs`로 확인 |
| `Unable to connect to the DB` | RDS 보안그룹에 EC2 보안그룹이 열려 있는지, `.env`의 `DB_HOST`가 맞는지 |
| 서버가 안 뜬다 (production) | JWT 시크릿이 비어 있는지 확인 — 의도적으로 기동을 막는다 |
| `bcrypt` 설치 실패 | `build-essential`, `python3`가 필요하다. `setup-ec2.sh`가 설치한다 |
| 재부팅 후 앱이 없다 | `pm2 startup` 출력 줄을 실행했는지, `pm2 save`를 했는지 |
| 디스크 가득 | `pm2 install pm2-logrotate`가 됐는지. `du -sh ~/.pm2/logs` |

## 아직 안 되어 있는 것

- **CI/CD 자동 배포** — 지금은 EC2에 SSH로 들어가 `deploy.sh`를 직접 돌린다.
  Week 5 Mon 일정(GitHub Actions → EC2)에서 자동화한다.
- **DB 백업** — RDS 자동 백업 설정을 확인해야 한다(Week 5 Fri).
- **모니터링·알림** — 앱이 죽었을 때 알 방법이 없다(Week 5 Fri).
