import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache/provider';
import './index.css'
import './i18n'
import './lib/posthog'
import { App } from './App.tsx'

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <ConvexQueryCacheProvider>
        <App />
      </ConvexQueryCacheProvider>
    </ConvexAuthProvider>
  </StrictMode>,
)
