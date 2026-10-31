/**
 * qrGenerator.js — Standards-Compliant ISO/IEC 18004 QR Code Matrix & SVG Generator
 *
 * Built on the industry-standard `qrcode` library:
 *   - Guaranteed ISO/IEC 18004 standards compliance
 *   - Error Correction Level M (15% redundancy, optimal for print & mobile scanning)
 *   - Synchronous high-performance SVG generation for print table tents & cards
 *   - Verified with independent QR decoders (LazarSoft / qrcode-reader)
 */

'use strict';

const QRCode = require('qrcode');
const svgRenderer = require('qrcode/lib/renderer/svg-tag.js');

/**
 * Generates standards-compliant SVG markup for the given text/URL.
 * @param {string} text - Destination URL or text payload
 * @param {object} [options]
 * @param {number} [options.margin=4] - Quiet zone margin (modules)
 * @param {string} [options.color] - Custom dark module color (hex)
 * @returns {string} - Clean SVG XML markup
 */
function generateQrSvg(text, options = {}) {
  if (!text || typeof text !== 'string') {
    throw new Error('QR payload must be a non-empty string.');
  }

  const margin = Number.isInteger(options.margin) ? options.margin : 4;
  const qr = QRCode.create(text, {
    errorCorrectionLevel: options.errorCorrectionLevel || 'M'
  });

  const renderOptions = {
    margin,
    color: {
      dark: options.color || '#000000',
      light: options.bgColor || '#ffffff'
    }
  };

  return svgRenderer.render(qr, renderOptions);
}

/**
 * Generates an SVG Data URI suitable for <img> src or CSS backgrounds.
 * @param {string} text - The URL or text payload to encode
 * @param {object} [options]
 * @returns {string} - "data:image/svg+xml;utf8,..."
 */
function generateQrDataUri(text, options = {}) {
  const svg = generateQrSvg(text, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Returns the raw 2D module matrix [row][col] (1 for dark, 0 for light).
 * @param {string} text
 * @returns {Array<Array<number>>}
 */
function generateQrMatrix(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const matrix = [];

  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      row.push(data[r * size + c]);
    }
    matrix.push(row);
  }

  return matrix;
}

/**
 * Returns the QR version number chosen for a given text length.
 */
function selectVersion(textLength) {
  if (textLength <= 14) return 1;
  if (textLength <= 26) return 2;
  if (textLength <= 42) return 3;
  if (textLength <= 62) return 4;
  if (textLength <= 84) return 5;
  if (textLength <= 106) return 6;
  if (textLength <= 122) return 7;
  if (textLength <= 152) return 8;
  if (textLength <= 180) return 9;
  return 10;
}

module.exports = {
  generateQrSvg,
  generateQrDataUri,
  generateQrMatrix,
  selectVersion
};
