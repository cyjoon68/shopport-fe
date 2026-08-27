# Shopport Mobile

Shopport의 Expo SDK 57 기반 iOS·Android 앱입니다. 대화형 상품 탐색, 카카오 로그인, 이미지 첨부, 찜과 대화 기록을 모바일 경험으로 제공합니다.

## 역할

**apps/mobile**은 Expo Router와 native Stack으로 화면 전환을 담당하고, 도메인 기능은 **features** 아래에 둡니다. 공통 색상·간격 토큰과 UI는 workspace package로 분리해 iOS와 Android에서 같은 경험을 유지합니다.

## 시작하기

Node.js 22.13 이상과 Corepack이 필요합니다.

~~~bash
corepack enable
pnpm install
cp .env.example .env
pnpm start
~~~

모바일 명령은 이 저장소 루트의 .env를 읽습니다. 기본 로컬 API 주소는 http://127.0.0.1:4000이고, Android emulator에서는 EXPO_PUBLIC_API_URL=http://10.0.2.2:4000을 사용합니다. API와 의존 서비스는 [통합 워크스페이스](https://github.com/cyjoon68/shopport-app)의 make dev-core로 실행할 수 있습니다.

## Development build

Kakao 네이티브 로그인을 포함하므로 Expo Go가 아닌 development build가 필요합니다.

~~~bash
cd apps/mobile
pnpm exec eas build --profile development --platform ios
pnpm exec eas build --profile development --platform android
~~~

EAS workflow는 CNG fingerprint가 같으면 OTA update를, 다르면 새 native build를 만듭니다. main은 store build까지만 수행하며 제출은 수동 승인입니다.

## 프로젝트 구조

| 경로 | 역할 |
| --- | --- |
| apps/mobile/src/app | Expo Router route |
| apps/mobile/src/features | auth, chat, catalog, favorites, history, profile 도메인 |
| apps/mobile/src/shared | storage, observability, config, 공통 UI |
| packages/tokens, packages/ui | Unistyles 기반 토큰과 재사용 UI |
| apps/mobile/schema.graphql | backend canonical schema의 pinned snapshot |

첫 화면 헤더에서 대화 기록과 설정으로 이동하며, 앱 루트·대화·상품 화면은 native Stack을 사용합니다.

## API와 로컬 데이터 계약

GraphQL Message.id와 live/SQLite UIMessage.id는 같은 canonical UUID를 사용합니다. 새 사용자 메시지는 클라이언트 UUID를 보내고, 서버는 client/stream UUID를 DB와 replay에 보존합니다. 앱은 canonical UUID만 server/live merge 키로 사용하며 legacy 로컬 ID는 source별로 격리합니다.

access token은 메모리에만, rotating refresh token은 SecureStore에만 저장합니다. SQLite에는 최근 대화 50개, 상품 100개, 찜과 초안만 제한 저장하고, 로그아웃·계정 삭제 시 Apollo·SQLite·SecureStore의 사용자 상태를 제거합니다. 오프라인 전송 큐는 없으며 캐시 조회와 초안 저장만 허용합니다. prompt, 이미지, access token, 구매 URL query token은 Sentry에 보내지 않습니다.

## 검사

~~~bash
pnpm check
pnpm test
pnpm codegen
git diff --exit-code
pnpm run doctor
pnpm build
~~~

Maestro flow는 apps/mobile/e2e에 있습니다.

## 관련 문서

- [통합 워크스페이스](https://github.com/cyjoon68/shopport-app)
- [모바일 설계](DESIGN.md)
- [의존성 감사 정책](security/audit-policy.md)
