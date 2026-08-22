import React, {useState} from 'react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

export function QueryProvider({children}: {children: React.ReactNode}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The database is local, so a read is cheap and never stale for
            // long. Freshness comes from invalidation on write (D8).
            staleTime: 0,
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
