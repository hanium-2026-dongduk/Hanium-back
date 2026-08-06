const { toExecutableSql, listMigrationFiles } = require('../../db/migrations/run');

describe('db/migrations/run.js', () => {
  describe('toExecutableSql', () => {
    test('DELIMITER 지시문 줄을 제거한다', () => {
      const raw = ['DELIMITER $$', 'SELECT 1 $$', 'DELIMITER ;'].join('\n');

      const sql = toExecutableSql(raw);

      expect(sql).not.toMatch(/DELIMITER/);
    });

    test('$$를 ;로 치환한다', () => {
      const raw = ['DELIMITER $$', 'CREATE PROCEDURE `p`() BEGIN SELECT 1; END $$', 'DELIMITER ;'].join(
        '\n'
      );

      const sql = toExecutableSql(raw);

      expect(sql).toContain('END ;');
      expect(sql).not.toContain('$$');
    });

    test('DELIMITER가 없는 평범한 SQL(예: CREATE TABLE)은 그대로 통과시킨다', () => {
      const raw = 'CREATE TABLE IF NOT EXISTS `t` (`id` BIGINT NOT NULL);';

      expect(toExecutableSql(raw)).toBe(raw);
    });
  });

  describe('listMigrationFiles', () => {
    test('NNNN_*.sql 형식의 파일만, 파일명 순서대로 나열한다', () => {
      const files = listMigrationFiles();

      expect(files.length).toBeGreaterThanOrEqual(6);
      expect(files).toEqual([...files].sort());
      files.forEach((f) => expect(f).toMatch(/^\d{4}_.*\.sql$/));
    });
  });
});
