let csrfTokenPromise: Promise<string> | null = null;

export async function getClientCsrfToken(): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('CSRF tokens are only available in the browser');
  }

  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not initialize CSRF protection');
        }

        const body = await response.json();
        if (!body?.token || typeof body.token !== 'string') {
          throw new Error('CSRF endpoint returned an invalid token');
        }

        return body.token;
      })
      .catch((error) => {
        csrfTokenPromise = null;
        throw error;
      });
  }

  return csrfTokenPromise;
}

export async function withClientCsrf(
  headers: Record<string, string> = {}
): Promise<Record<string, string>> {
  return {
    ...headers,
    'x-csrf-token': await getClientCsrfToken(),
  };
}
