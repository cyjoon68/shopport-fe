# Shopport FE

Shopport의 Expo SDK 57 iOS·Android 앱이다. Node.js 22.13 이상과 Corepack을 사용한다.

## 실행

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm start
```

모바일 명령은 이 저장소 루트의 `.env`를 읽는다. Kakao 네이티브 로그인을 포함하므로 Expo Go가 아닌 development build가 필요하다. 로컬 API 기본 주소는 `http://127.0.0.1:4000`이다. Android emulator에서는 `.env`의 `EXPO_PUBLIC_API_URL=http://10.0.2.2:4000`을 사용한다.

```bash
cd apps/mobile
pnpm exec eas build --profile development --platform ios
pnpm exec eas build --profile development --platform android
```

## 구조

- `apps/mobile/src/app`: Expo Router route만 배치
- `apps/mobile/src/features`: auth, chat, catalog, favorites, history, profile
- `packages/tokens`, `packages/ui`: Unistyles 기반 공통 토큰과 UI
- `apps/mobile/schema.graphql`: backend canonical schema의 pinned snapshot

앱 루트와 chat, product는 `expo-router` native Stack을 사용한다. 첫 화면 헤더에서 대화 기록과 설정으로 이동한다.

채팅 메시지 ID 계약은 GraphQL `Message.id`와 live/SQLite `UIMessage.id`가 동일한 canonical UUID를 사용하는 것이다. 새 사용자 메시지는 클라이언트 UUID를 전송하고, 서버는 client/stream UUID를 DB와 replay에 그대로 보존해야 한다. 앱은 canonical UUID만 server/live merge 키로 사용하며 legacy 로컬 ID는 source별로 격리한다.

## 검사

```bash
pnpm check
pnpm test
pnpm codegen
git diff --exit-code
pnpm run doctor
pnpm build
```

Maestro flow는 `apps/mobile/e2e`에 있다. EAS workflow는 CNG fingerprint로 development build 존재 여부를 확인한다. 동일 fingerprint면 OTA update, 다르면 새 native build를 만든다. `main`은 store build까지만 수행하며 제출은 수동 승인한다.

## 보안 및 로컬 데이터

- access token은 메모리에만, rotating refresh token은 SecureStore에만 저장한다.
- SQLite에는 최근 대화 50개, 상품 100개, 찜과 초안만 제한 저장한다.
- 로그아웃·계정 삭제 시 Apollo, SQLite, SecureStore 사용자 상태를 제거한다.
- 오프라인 전송 큐는 없다. 오프라인에서는 캐시 조회와 초안 저장만 허용한다.
- prompt, 이미지, access token, 구매 URL query token은 Sentry에 보내지 않는다.
