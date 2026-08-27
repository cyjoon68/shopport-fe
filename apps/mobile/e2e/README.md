# Maestro E2E

Development build에서 카카오 로그인을 한 번 완료한 뒤 앱 데이터를 유지합니다.

빠른 질문 입력과 Drawer 제스처는 API 응답 없이 실행할 수 있습니다.

```bash
maestro test e2e/quick-action-composer.yaml
maestro test e2e/drawer-gesture.yaml
```

응답 중단과 메시지 편집은 로컬 API, AI provider와 로그인 세션이 준비된 환경에서 실행합니다.

```bash
maestro test e2e/agent-control.yaml
```
