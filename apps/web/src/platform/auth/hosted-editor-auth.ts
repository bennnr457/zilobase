// A WebView credential must never enter cookies, local storage, or the desktop keyring.
let token: string | null = null;
export function getHostedEditorAuthToken() {
  return token;
}
export function setHostedEditorAuthToken(value: string | null) {
  token = value;
}
