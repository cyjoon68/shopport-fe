# Maestro E2E

`EXPO_PUBLIC_E2E_MODE=1` 빌드는 테스트 API의 고정 identity를 사용하므로 실제 카카오 credential이 필요하지 않습니다. Production profile은 이 설정을 거부합니다. 일반 development build는 카카오 로그인을 한 번 완료한 뒤 앱 데이터를 유지합니다.

빠른 질문 입력과 Drawer 제스처는 API 응답 없이 실행할 수 있습니다.

```bash
maestro test e2e/quick-action-composer.yaml
maestro test e2e/drawer-gesture.yaml
```

응답 중단과 메시지 편집은 로컬 API와 로그인 세션이 준비된 환경에서 실행합니다. CI는 고정 catalog·AI 응답을 제공하는 `shopport-be`의 Maestro runner를 사용합니다.

```bash
maestro test e2e/agent-control.yaml
```
