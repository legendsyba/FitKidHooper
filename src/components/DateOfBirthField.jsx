import { useEffect, useMemo, useState } from "react";

/**
 * Birthday entry as three lists instead of a date picker.
 *
 * `<input type="date">` looked right and behaved badly here. The range has to
 * span a century — adults train alongside the kids, and capping the picker at 18
 * left them unable to enter a birthday at all — but a native picker opens at one
 * end of whatever range it is given. A twelve-year-old was landing on 1926 and
 * scrolling eighty-five years to reach their own birth year, on a phone.
 *
 * Years are listed newest first, so the app's actual audience finds itself in the
 * first handful of rows and an adult is still a scroll away rather than excluded.
 *
 * Emits "YYYY-MM-DD", the same string the date input produced, so everything
 * downstream — calcAge, the age group, the consent threshold — is untouched.
 * Emits "" until all three are chosen: a half-entered birthday must not read as a
 * real one to an age check with a legal boundary behind it.
 *
 * The three parts are held here rather than derived from `value`, which is the
 * trap this walked into first: a partly-filled birthday has no valid `value` to
 * be derived from, so each selection reset the one before it and the field could
 * never be completed at all.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n) => String(n).padStart(2, "0");
const daysInMonth = (year, month) =>
  month ? new Date(Number(year) || 2000, Number(month), 0).getDate() : 31;

function partsOf(value) {
  const [y = "", m = "", d = ""] = (value || "").split("-");
  return { y, m: m ? String(Number(m)) : "", d: d ? String(Number(d)) : "" };
}

export default function DateOfBirthField({
  value = "",
  onChange,
  min,
  max,
  selectStyle = {},
  P = "#f97316",
}) {
  const [parts, setParts] = useState(() => partsOf(value));

  // Follow the value when it changes from outside (a cloud restore, a reset),
  // but never fight the half-filled state the person is in the middle of typing.
  useEffect(() => {
    if (!value) return;
    const next = partsOf(value);
    setParts((cur) =>
      cur.y === next.y && cur.m === next.m && cur.d === next.d ? cur : next);
  }, [value]);

  const { minYear, maxYear } = useMemo(() => ({
    minYear: min ? Number(min.slice(0, 4)) : new Date().getFullYear() - 100,
    maxYear: max ? Number(max.slice(0, 4)) : new Date().getFullYear(),
  }), [min, max]);

  // Newest first — the common case should be near the top, not a century down.
  const years = useMemo(() => {
    const out = [];
    for (let yr = maxYear; yr >= minYear; yr--) out.push(yr);
    return out;
  }, [minYear, maxYear]);

  const dayCount = daysInMonth(parts.y, parts.m);

  function update(patch) {
    const next = { ...parts, ...patch };
    // A month change can strand a day that no longer exists (31 → February).
    if (next.d && Number(next.d) > daysInMonth(next.y, next.m)) {
      next.d = String(daysInMonth(next.y, next.m));
    }
    setParts(next);

    if (!next.y || !next.m || !next.d) { onChange(""); return; }
    const composed = `${next.y}-${pad(next.m)}-${pad(next.d)}`;
    // Respect the same bounds the date input enforced; the year list alone
    // cannot, since the edge years are only partly in range.
    if (min && composed < min) { onChange(min); setParts(partsOf(min)); return; }
    if (max && composed > max) { onChange(max); setParts(partsOf(max)); return; }
    onChange(composed);
  }

  const base = { flex: 1, minWidth: 0, appearance: "none", cursor: "pointer", ...selectStyle };

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      <select aria-label="Birth month" value={parts.m}
        onChange={(e) => update({ m: e.target.value })}
        style={{ ...base, flex: 1.4 }}>
        <option value="">Month</option>
        {MONTHS.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
      </select>

      <select aria-label="Birth day" value={parts.d}
        onChange={(e) => update({ d: e.target.value })}
        style={base}>
        <option value="">Day</option>
        {Array.from({ length: dayCount }, (_, i) => i + 1)
          .map((n) => <option key={n} value={n}>{n}</option>)}
      </select>

      <select aria-label="Birth year" value={parts.y}
        onChange={(e) => update({ y: e.target.value })}
        style={{ ...base, flex: 1.1, borderColor: parts.y ? P : base.borderColor }}>
        <option value="">Year</option>
        {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  );
}
