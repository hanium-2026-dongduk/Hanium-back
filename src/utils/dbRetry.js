const { sequelize } = require('../models');

const MAX_DEADLOCK_RETRIES = 3;

const isDeadlockError = (err) => {
  return err?.original?.code === 'ER_LOCK_DEADLOCK' || err?.parent?.code === 'ER_LOCK_DEADLOCK';
};

/**
 * "없으면 INSERT, 유니크 충돌 나면 재조회" 패턴은, 같은 행을 노리는 트랜잭션이 여러 개
 * 동시에 도착하면 InnoDB가 갭 락 경합으로 데드락을 낼 수 있다(여러 트랜잭션이 동시에
 * "없음"을 보고 INSERT를 시도하는 전형적인 상황). 데드락은 MySQL이 한쪽 트랜잭션을
 * 강제로 롤백시켜 해결하는 정상적인 동시성 제어 메커니즘이므로, 그 트랜잭션만 짧게
 * 재시도하면 안전하게 완료된다.
 *
 * Week2의 usage heartbeat에서 실제로 겪은 실패 시나리오라, 같은 패턴을 쓰는 출석/지갑
 * 최초 생성 경로에도 선제 적용한다.
 *
 * @param {(t: import('sequelize').Transaction) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
const runWithDeadlockRetry = async (fn) => {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_DEADLOCK_RETRIES; attempt += 1) {
    try {
      return await sequelize.transaction(fn);
    } catch (err) {
      lastErr = err;
      if (!isDeadlockError(err) || attempt === MAX_DEADLOCK_RETRIES) {
        throw err;
      }
    }
  }
  throw lastErr;
};

/**
 * 트랜잭션 합류 정책(docs/WEEK3_A_DESIGN.md 5-4절)을 한 곳에 구현한 헬퍼.
 *
 * - 호출자가 트랜잭션을 넘기면 **그 트랜잭션을 그대로 재사용**한다(새 트랜잭션도
 *   SAVEPOINT도 열지 않음). 재시도는 하지 않는다 — 트랜잭션의 생명주기와 재시도 여부는
 *   그것을 연 최상위 호출자가 결정할 문제이고, 중간에서 다시 시도하면 이미 그 트랜잭션에
 *   쌓인 다른 작업까지 중복 실행되기 때문이다.
 * - 넘기지 않으면 자신이 최상위 트랜잭션을 열고, 데드락 시 재시도한다.
 *
 * @param {import('sequelize').Transaction|undefined} transaction
 * @param {(t: import('sequelize').Transaction) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
const withTransaction = (transaction, fn) => {
  return transaction ? fn(transaction) : runWithDeadlockRetry(fn);
};

module.exports = {
  MAX_DEADLOCK_RETRIES,
  isDeadlockError,
  runWithDeadlockRetry,
  withTransaction,
};
