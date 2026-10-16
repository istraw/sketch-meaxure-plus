// Bound raster allocation before entering native rendering. Vector formats do
// not allocate a bitmap of these dimensions.
const MAX_RASTER_PIXELS = 64 * 1024 * 1024;
export function getExportScale(size: string, width: number, height: number): number {
    const match = /^([0-9]+(?:\.[0-9]+)?)(x|w|width|px|h|height)$/.exec(String(size));
    if (!match) throw new Error(`Invalid export size: ${size}`);
    const value = Number(match[1]);
    return match[2] === 'x' ? value : value / (/^(h|height)$/.test(match[2]) ? height : width);
}
export function validateExportSize(width: number, height: number, scale: number, format: string) {
    if (![width, height, scale].every(n => isFinite(n) && n > 0)) {
        throw new Error('Cannot export an empty layer or a non-finite image size');
    }
    if (['svg', 'pdf', 'eps'].indexOf(format.toLowerCase()) >= 0) return;
    const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
    if (!isFinite(w * h) || w * h > MAX_RASTER_PIXELS) {
        throw new Error(`Image ${w} × ${h} exceeds the 64 megapixel export limit; reduce the export scale`);
    }
}
