const CLERK_PLACEHOLDER = 'REPLACE_WITH_';

function isConfiguredValue(value: string | undefined): value is string {
  return Boolean(value && !value.startsWith(CLERK_PLACEHOLDER));
}

export function isClerkConfigured(): boolean {
  return (
    isConfiguredValue(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    isConfiguredValue(process.env.CLERK_SECRET_KEY)
  );
}