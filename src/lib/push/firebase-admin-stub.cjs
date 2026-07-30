/**
 * Cloudflare Workers / OpenNext stub for firebase-admin.
 *
 * Real firebase-admin → jwks-rsa → jose breaks the OpenNext esbuild step
 * (workerd export points at dist/browser which is not copied for nested jose).
 * FCM is Node-only (Vercel); on Cloudflare we no-op and skip sends.
 */

const messaging = {
  send: async () => {
    throw new Error('FCM is not available on Cloudflare Workers');
  },
};

const admin = {
  apps: [],
  initializeApp() {
    return admin;
  },
  credential: {
    cert() {
      return {};
    },
  },
  messaging() {
    return messaging;
  },
};

module.exports = admin;
module.exports.default = admin;
