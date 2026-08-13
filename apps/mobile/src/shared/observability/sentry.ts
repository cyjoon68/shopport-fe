import * as Sentry from '@sentry/react-native';
import { environment } from '@/shared/config/environment';

Sentry.init({
  dsn: environment.sentryDsn,
  enabled: environment.sentryDsn.length > 0,
  sendDefaultPii: false,
  attachStacktrace: true,
});

export { Sentry };
