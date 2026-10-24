/** Dutch copy for Instagram approve action failures (UI must surface these). */

export function approveInstagramConceptErrorMessage(
  error: string,
  detail?: string,
): string {
  switch (error) {
    case "unauthorized":
      return "Je bent niet ingelogd als beheerder.";
    case "invalid_concept":
      return "Concept is onvolledig (events, caption of slides ontbreken).";
    case "catalog_unavailable":
      return "Catalogus kon niet worden geladen. Probeer opnieuw.";
    case "events_missing":
      return detail
        ? `Event ontbreekt in de catalogus (${detail}). Vernieuw de pagina en keur opnieuw goed.`
        : "Een of meer events ontbreken in de catalogus. Vernieuw de pagina.";
    case "approval_store_failed":
      return detail
        ? `Goedkeuring kon niet worden opgeslagen: ${detail}`
        : "Goedkeuring kon niet worden opgeslagen. Probeer opnieuw.";
    default:
      return "Goedkeuren mislukt — probeer opnieuw.";
  }
}
