/** Remote production connections must verify the server's identity. */
export function postgresTlsMode(
  connectionUrl: string,
  production: boolean,
  cloudflare: boolean
): 'verify-full' | false {
  const url = new URL(connectionUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const ssl = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl');
  const explicitTls = !!ssl && !['disable', 'false', '0'].includes(ssl);
  const managedHost = [
    'supabase.co',
    'db.bit.io',
    'postgres.database.azure.com',
    'rds.amazonaws.com',
  ].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  );
  return explicitTls || (!local && (production || cloudflare || managedHost))
    ? 'verify-full'
    : false;
}
