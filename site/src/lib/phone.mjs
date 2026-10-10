// Lead form phone handling (Package B, owner-approved 2026-10-10). Plain ESM with JSDoc so the form script and node:test
// share it. libphonenumber-js "min" metadata, pinned exactly in package.json.
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * The full number in E.164 (e.g. +971501234567) when the national number is valid for the chosen country, else null.
 * A number typed with its own "+code" must still belong to the chosen country's calling code.
 * @param {string} national what the visitor typed
 * @param {string} country ISO 3166-1 alpha-2 code from the country-code select
 * @returns {string | null}
 */
export function toE164(national, country) {
  const n = String(national ?? '').trim();
  if (!n || !country) return null;
  let code;
  try { code = getCountryCallingCode(/** @type {any} */ (country)); } catch { return null; }
  const p = parsePhoneNumberFromString(n, /** @type {any} */ (country));
  return p && p.isValid() && p.countryCallingCode === code ? p.number : null;
}

/**
 * Every country libphonenumber-js knows, for the country-code select: ISO code, English name, flag and dial code,
 * sorted by name.
 * @returns {{ cc: string, name: string, flag: string, dial: string }[]}
 */
export function dialCodes() {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const flag = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  return getCountries()
    .map((cc) => ({ cc, name: names.of(cc) ?? cc, flag: flag(cc), dial: getCountryCallingCode(cc) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
