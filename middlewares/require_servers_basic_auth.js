/**
 * Intentionally a no-op.
 * Backuprer sends Configurer username/password as HTTP Basic by mistake for
 * utility operation — we capture those on the server row after TAG/OTP auth,
 * but do not gate /api/servers on Basic credentials.
 */
export default async function requireServersBasicAuth() {
    return;
}
