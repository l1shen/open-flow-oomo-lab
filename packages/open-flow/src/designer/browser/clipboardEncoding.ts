/* eslint-disable prefer-spread */
export function base64Encode(str: string): string {
  return uint8ArrayToBase64(new TextEncoder().encode(str))
}

export function base64Decode(base64: string): string {
  return new TextDecoder().decode(base64ToUint8Array(base64))
}

// From package `uint8array-extras`.
function uint8ArrayToBase64(array: Uint8Array): string {
  if (array.length < 65535) {
    return btoa(String.fromCodePoint.apply(String, array as unknown as number[]))
  } else {
    let base64 = ''
    for (const value of array) {
      base64 += String.fromCodePoint(value)
    }
    return btoa(base64)
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (x) => x.codePointAt(0)!)
}
