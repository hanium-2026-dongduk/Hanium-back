const { swaggerSpec } = require('../../src/config/swagger');

/**
 * 문서가 코드와 어긋나지 않게 지키는 테스트.
 *
 * Swagger를 둔 목적이 "실행 가능한 계약"인데, 엔드포인트를 추가하고 주석을 빠뜨리면
 * 문서가 조용히 낡는다. 그러면 프론트가 다시 추정으로 붙이게 되고, 애초에 이 문서를
 * 만든 이유가 사라진다. 그래서 **라우터에 등록된 모든 엔드포인트가 문서에 있는지**
 * 자동으로 확인한다.
 */

/** src/routes/index.js의 마운트 경로. 라우터를 추가하면 여기에도 넣어야 한다. */
const MOUNTS = {
  '/health': 'health.route',
  '/auth': 'auth.route',
  '/children': 'child.route',
  '/guardian': 'guardian.route',
  '/usage': 'usage.route',
  '/attendance': 'attendance.route',
  '/missions': 'mission.route',
  '/rewards': 'reward.route',
  '/badges': 'badge.route',
  '/stickers': 'sticker.route',
};

/**
 * 실제 라우터에 등록된 엔드포인트를 모은다.
 * @returns {Array<{method: string, path: string}>} path는 OpenAPI 표기({id})로 변환된 값
 */
const collectRegisteredRoutes = () => {
  const found = [];

  for (const [prefix, moduleName] of Object.entries(MOUNTS)) {
    const router = require(`../../src/routes/${moduleName}`);

    for (const layer of router.stack || []) {
      if (!layer.route) continue;

      // Express의 ':id'를 OpenAPI의 '{id}'로 바꾼다.
      const suffix = layer.route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      // '/'로 끝나면 마운트 경로만 남긴다 ('/badges/' → '/badges')
      const path = `${prefix}${suffix}`.replace(/\/$/, '') || prefix;

      for (const method of Object.keys(layer.route.methods)) {
        found.push({ method, path });
      }
    }
  }

  return found;
};

describe('Swagger 스펙은', () => {
  const registered = collectRegisteredRoutes();

  test('라우터에 엔드포인트가 실제로 등록되어 있다', () => {
    // MOUNTS가 비거나 라우터 내부 구조가 바뀌면 아래 검사들이 전부 무의미해지므로 먼저 확인한다.
    expect(registered.length).toBeGreaterThan(20);
  });

  test('등록된 모든 엔드포인트가 문서에 있다', () => {
    const missing = registered.filter(({ method, path }) => !swaggerSpec.paths?.[path]?.[method]);

    expect(
      missing.map((r) => `${r.method.toUpperCase()} ${r.path}`)
    ).toEqual([]);
  });

  test('문서에만 있고 실제로는 없는 엔드포인트가 없다', () => {
    // 엔드포인트를 지웠는데 주석만 남으면 프론트가 없는 API를 부르게 된다.
    const registeredKeys = new Set(registered.map((r) => `${r.method} ${r.path}`));
    const ghosts = [];

    for (const [path, methods] of Object.entries(swaggerSpec.paths || {})) {
      for (const method of Object.keys(methods)) {
        if (!registeredKeys.has(`${method} ${path}`)) {
          ghosts.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(ghosts).toEqual([]);
  });

  test('모든 엔드포인트에 summary와 tags가 있다', () => {
    const incomplete = [];

    for (const [path, methods] of Object.entries(swaggerSpec.paths || {})) {
      for (const [method, op] of Object.entries(methods)) {
        if (!op.summary || !op.tags?.length) {
          incomplete.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(incomplete).toEqual([]);
  });

  test('참조하는 컴포넌트가 모두 정의되어 있다', () => {
    // $ref 오타는 UI에서 빈 스키마로 조용히 표시돼 눈치채기 어렵다.
    const refs = new Set();
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.$ref === 'string') refs.add(node.$ref);
      Object.values(node).forEach(walk);
    };
    walk(swaggerSpec.paths);

    const broken = [...refs].filter((ref) => {
      const segments = ref.replace(/^#\//, '').split('/');
      return segments.reduce((acc, key) => (acc ? acc[key] : undefined), swaggerSpec) === undefined;
    });

    expect(broken).toEqual([]);
  });

  test('사용된 태그가 모두 선언되어 있다', () => {
    const declared = new Set((swaggerSpec.tags || []).map((t) => t.name));
    const used = new Set();

    for (const methods of Object.values(swaggerSpec.paths || {})) {
      for (const op of Object.values(methods)) {
        (op.tags || []).forEach((t) => used.add(t));
      }
    }

    expect([...used].filter((t) => !declared.has(t))).toEqual([]);
  });

  test('인증이 필요 없는 엔드포인트만 security를 비운다', () => {
    // 기본값이 bearerAuth라, 실수로 security: []를 붙이면 보호된 API가 공개처럼 문서화된다.
    const PUBLIC = [
      'get /health',
      'post /auth/signup',
      'post /auth/email/send',
      'post /auth/email/verify',
      'post /auth/login',
      'post /auth/logout',
      'post /auth/refresh',
      'post /auth/password/reset-request',
      'put /auth/password/reset',
    ];

    const declaredPublic = [];
    for (const [path, methods] of Object.entries(swaggerSpec.paths || {})) {
      for (const [method, op] of Object.entries(methods)) {
        if (Array.isArray(op.security) && op.security.length === 0) {
          declaredPublic.push(`${method} ${path}`);
        }
      }
    }

    expect(declaredPublic.sort()).toEqual([...PUBLIC].sort());
  });
});
