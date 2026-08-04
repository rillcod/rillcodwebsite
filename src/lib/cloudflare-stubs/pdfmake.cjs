/**
 * Cloudflare Workers stubs for heavy Node PDF engines.
 * Certificates/PDF generation run in the Cloudflare Container (full Node, real pdfmake).
 * This stub only applies to the legacy OpenNext Workers build, which must stay under
 * the 64 MiB Worker size limit.
 */
module.exports = {
  createPdf: () => {
    throw new Error("PDF generation is not available on Cloudflare Workers");
  },
  vfs: {},
};
module.exports.default = module.exports;
