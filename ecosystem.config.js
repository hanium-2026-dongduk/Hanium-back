/**
 * PM2 설정 (Week 4 — EC2 배포).
 *
 * 실행:
 *   pm2 start ecosystem.config.js --env production   # 최초 기동
 *   pm2 reload hanium-api                            # 무중단 재배포
 *
 * 환경변수는 여기 두지 않고 서버의 `.env`에서 읽는다(dotenv). 시크릿이 저장소에 들어가는
 * 것을 막기 위함이다 — `.env.production.example`을 복사해 채운다.
 */
module.exports = {
  apps: [
    {
      name: 'hanium-api',
      script: 'src/server.js',

      // 코어 수만큼 워커를 띄운다. 앱이 모듈 레벨에 가변 상태를 두지 않고 모든 상태를
      // DB에 두므로 워커를 늘려도 안전하다. (t2.micro처럼 vCPU가 1개면 워커도 1개다)
      instances: 'max',
      exec_mode: 'cluster',

      // reload 시 워커가 'ready'를 보낼 때까지 기다린 뒤 다음 워커를 재시작한다.
      // 이게 없으면 모든 워커가 동시에 죽어 순간적으로 502가 난다.
      wait_ready: true,
      listen_timeout: 10_000,

      // SIGINT를 받은 워커가 진행 중인 요청을 마칠 시간. server.js의 종료 타임아웃(10초)보다
      // 길어야 강제 종료 전에 스스로 정리할 기회가 생긴다.
      kill_timeout: 15_000,

      // 비정상 종료 시 재시작하되, 계속 죽으면 무한 재시작 루프에 빠지지 않도록 제한한다.
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      // 메모리가 새면 재시작한다. t2.micro(1GB)에서 워커 하나가 이 이상 쓰면 비정상이다.
      max_memory_restart: '400M',

      // 파일 변경 감지는 개발용이다. 운영에서 켜면 배포 중 파일이 바뀔 때마다 재시작한다.
      watch: false,

      env_production: {
        NODE_ENV: 'production',
      },

      // 로그는 pm2-logrotate가 관리한다(setup-ec2.sh에서 설치).
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
