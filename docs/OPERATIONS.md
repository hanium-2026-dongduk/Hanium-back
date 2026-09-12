# 운영 백업·모니터링

## 현재 운영 기준

- API 상태 확인: `https://magicbook-54-252-159-59.nip.io/api/health`
- GitHub Actions `Production Monitor`: 15분마다 HTTPS 상태와 EC2 루트 디스크 사용량 확인
- 디스크 경보 기준: 80%
- PM2 로그: 파일당 10MB, 7개 보관, gzip 압축, 매일 회전
- RDS 자동 백업: 활성화, 현재 보관 기간 1일
- RDS 스토리지 암호화: 활성화
- RDS 삭제 방지: 비활성화

GitHub 모니터링이 실패하면 `🚨 운영 API 장애 감지` 이슈를 하나만 유지하고, 복구된 다음
성공 실행에서 자동으로 닫는다. GitHub 이슈 알림을 이메일로 받으려면 저장소 Watch 알림에
Issues가 포함돼 있어야 한다.

## AWS 관리자에게 필요한 변경

EC2의 `SafeRole-project6-56-sydney`에는 RDS·CloudWatch 조회/변경 권한이 충분하지 않다.
AWS 관리자 권한으로 다음을 적용한다.

1. RDS `project6-56-db` 자동 백업 보관 기간을 7일로 변경한다.
2. RDS 삭제 방지를 활성화한다.
3. EC2 `StatusCheckFailed`가 5분 이상 1 이상일 때 알림을 보내는 CloudWatch 경보를 만든다.
4. EBS `vol-025b642338138f2ae`와 EC2 메모리·디스크를 보려면 CloudWatch Agent용 IAM 정책을
   인스턴스 역할에 추가하고 Agent를 설치한다.
5. 알림 대상 SNS 주제에 운영 담당 이메일 또는 Slack 연동을 구독한다.

## RDS 복구 훈련

복구는 기존 운영 DB를 덮어쓰지 않고 새 인스턴스로 수행한다.

1. RDS 콘솔에서 `project6-56-db`를 선택한다.
2. `작업 → 특정 시점으로 복원`을 선택하고 최신 복원 가능 시점을 지정한다.
3. 새 식별자(예: `project6-56-db-restore-drill`)를 사용한다.
4. 운영 EC2 보안그룹만 새 DB의 3306 인바운드 소스로 허용한다.
5. 임시 환경변수로 복구 DB에 접속해 핵심 테이블과 최근 데이터 건수를 확인한다.
6. 검증 결과를 #13에 기록한다.
7. 비용 발생을 막기 위해 검증 후 복구 인스턴스를 삭제한다. 운영 DB는 건드리지 않는다.

복구 인스턴스 생성은 과금이 발생하므로 AWS 관리자와 실행 시간을 합의한 뒤 진행한다.

## 장애 확인 순서

```bash
pm2 list
pm2 logs hanium-api --lines 100 --nostream
df -h /
sudo systemctl status nginx
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://magicbook-54-252-159-59.nip.io/api/health
```

DB 연결 오류라면 RDS 상태와 RDS 보안그룹의 3306 소스가 EC2 보안그룹인지 우선 확인한다.
