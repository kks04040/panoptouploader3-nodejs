/**
 * Panopto API 응답에서 대소문자 변종을 포함해 필드를 안전하게 추출한다.
 * Panopto REST/SOAP 응답 키가 일관되지 않으므로(id/Id/ID) 검증 견고성을 위해 사용.
 * @param {object} obj 응답 객체
 * @param  {...string} names 후보 필드명
 * @returns {any} 첫 번째로 발견된 값 (없으면 undefined)
 */
export function pickField(obj, ...names) {
  if (!obj) return undefined;
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  }
  const lower = names.map((n) => n.toLowerCase());
  for (const k of Object.keys(obj)) {
    if (lower.includes(k.toLowerCase())) return obj[k];
  }
  return undefined;
}
