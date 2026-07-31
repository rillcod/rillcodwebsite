/**
 * Cloudflare Workers stubs for heavy Node PDF engines.
 * Certificates/PDF generation stay on Vercel; CF builds must stay under Worker size limits.
 */
module.exports = {
  createPdf: () => {
    throw new Error("PDF generation is not available on Cloudflare Workers");
  },
  vfs: {},
};
module.exports.default = module.exports;
