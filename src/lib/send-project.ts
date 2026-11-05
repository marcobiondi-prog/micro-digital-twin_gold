/** Opens the dashboard's "Esporta report" sheet (the project's report, table, map data and photos) from anywhere on the page. */
export const SEND_PROJECT_EVENT = "mdt-send-project";
export function openProjectSend() { window.dispatchEvent(new Event(SEND_PROJECT_EVENT)); }
