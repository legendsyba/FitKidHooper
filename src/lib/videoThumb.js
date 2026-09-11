/**
 * Video tile artwork, without calling Google.
 *
 * The workout list and the exercise sheet used to draw their tiles straight from
 * `img.youtube.com/vi/<id>/…`. That is a request to a Google server — IP address,
 * referrer, and whatever Google cookies the device already carries — made for
 * every card on screen, before a child taps anything. Browsing the drill list was
 * enough to be counted. For a service aimed at nine-to-fourteen year olds that is
 * the wrong default, and it is the surface a privacy notice cannot really explain
 * away.
 *
 * Re-hosting the thumbnails would fix the privacy side and buy a copyright and
 * terms-of-service question instead: those images belong to 258 other creators.
 * So tiles for other people's videos are drawn instead — deterministically, so a
 * given drill always looks the same, and tinted with the colour its category
 * already uses. Our own filmed videos keep their real thumbnail, because that
 * frame is ours to show.
 *
 * Playback is unchanged: tapping still opens the YouTube player, which is
 * disclosed in the privacy notice.
 */

/** Stable 32-bit hash — same drill, same artwork, every render and every device. */
function hash(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The real thumbnail when it is ours to serve, otherwise null.
 * Anything filmed for FKH sets videoSource:"fkh" and carries a thumbnailUrl in
 * our own storage bucket.
 */
export function ownThumbnail(item) {
  if (!item) return null;
  return item.videoSource === "fkh" && item.thumbnailUrl ? item.thumbnailUrl : null;
}

/**
 * A CSS background for a drawn tile. `seed` is anything stable about the drill
 * (its video id or name); `color` is the category colour already in use around it.
 */
export function thumbBackdrop(seed = "", color = "#f97316") {
  const h = hash(String(seed));
  const angle = 115 + (h % 60);          // 115–174deg, so tiles do not all match
  // Unsigned shifts: `>>` is signed, so a hash above 2^31 yielded a negative
  // offset and pushed the highlight off the tile entirely.
  const x = 20 + ((h >>> 4) % 60);       // highlight placement, 20–79%
  const y = 18 + ((h >>> 10) % 44);      // 18–61%
  return [
    `radial-gradient(circle at ${x}% ${y}%, ${color}3d 0%, transparent 58%)`,
    `linear-gradient(${angle}deg, ${color}26 0%, #070d17 52%, ${color}14 100%)`,
  ].join(", ");
}
