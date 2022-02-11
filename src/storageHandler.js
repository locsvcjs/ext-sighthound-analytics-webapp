export function getLSServerAddress() {
    return JSON.parse(localStorage.getItem("serverAddress")) || "";
}
export function setLSServerAddress(value) {
    localStorage.setItem("serverAddress", JSON.stringify(value));
}
export function clearLocalStorage() {
    localStorage.clear();
}