import posthog from 'posthog-js'

// Product analytics. Disabled (no-op) unless VITE_POSTHOG_KEY and
// VITE_POSTHOG_HOST are set at build time.
const posthogKey = import.meta.env.VITE_POSTHOG_KEY
const posthogHost = import.meta.env.VITE_POSTHOG_HOST
export const isPostHogEnabled = Boolean(posthogKey && posthogHost)

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    ui_host: 'https://eu.posthog.com',
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  })
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (isPostHogEnabled) posthog.capture(event, properties)
}

export function identify(userId: string, email: string | null) {
  if (isPostHogEnabled) posthog.identify(userId, email ? { email } : {})
}

export function resetAnalytics() {
  if (isPostHogEnabled) posthog.reset()
}
