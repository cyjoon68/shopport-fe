# Shopport Mobile

Shopport의 Expo SDK 57 기반 iOS·Android 앱입니다. 대화형 상품 탐색, 카카오 로그인, 이미지 첨부, 찜과 대화 기록을 모바일 경험으로 제공합니다.

## 역할

Expo Router와 native Stack으로 화면 전환을 담당하고, 도메인 기능은 `src/features` 아래에 둡니다. 공통 색상·간격 토큰과 UI는 앱 안에서 관리해 iOS와 Android에서 같은 경험을 유지합니다.

## 시작하기

Node.js 22.13 이상과 Corepack이 필요합니다.

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm start
```

모바일 명령은 이 저장소 루트의 .env를 읽습니다. 기본 로컬 API 주소는 http://127.0.0.1:4000이고, Android emulator에서는 EXPO_PUBLIC_API_URL=http://10.0.2.2:4000을 사용합니다. API와 의존 서비스는 [통합 워크스페이스](https://github.com/cyjoon68/shopport-app)의 make dev-core로 실행할 수 있습니다.

## Development build

Kakao 네이티브 로그인을 포함하므로 Expo Go가 아닌 development build가 필요합니다.

```bash
pnpm exec eas build --profile development --platform ios
pnpm exec eas build --profile development --platform android
```

EAS workflow는 CNG fingerprint가 같으면 OTA update를, 다르면 새 native build를 만듭니다. main은 store build까지만 수행하며 제출은 수동 승인입니다.

## 프로젝트 구조

| 경로             | 역할                                           |
| ---------------- | ---------------------------------------------- |
| `src/app`        | Expo Router route                              |
| `src/features`   | auth, chat, catalog, favorites, profile 도메인 |
| `src/shared`     | storage, observability, config, 공통 UI        |
| `src/theme`      | Unistyles theme과 design token                 |
| `schema.graphql` | backend canonical schema의 pinned snapshot     |

첫 화면 헤더에서 대화 기록과 설정으로 이동하며, 앱 루트·대화·상품 화면은 native Stack을 사용합니다.

## 검사

```bash
pnpm check
pnpm test
pnpm codegen
git diff --exit-code
pnpm run doctor
pnpm build
```

Maestro flow는 `e2e/`에 있습니다.

## 관련 문서

- [통합 워크스페이스](https://github.com/cyjoon68/shopport-app)
- [모바일 설계](DESIGN.md)
- [의존성 감사 정책](security/audit-policy.md)
