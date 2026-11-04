/**
 * 32px accessible markers distinguished by shape, symbol, and color:
 * - Origin: Filled circular pin "A" (Tactical Green)
 * - Destination: Rounded square pin "B" (Tactical Amber)
 */
export function createEndpointElement(kind) {
  const isOrigin = kind === 'origin';
  const el = document.createElement('div');
  el.className = 'leaflet-pin-wrapper vayu-pin-marker';
  el.innerHTML = `<span class="pin ${isOrigin ? 'pin-o' : 'pin-d'}" aria-hidden="true">${isOrigin ? 'A' : 'B'}</span>`;
  return el;
}

export function endpointIcon(kind) {
  return createEndpointElement(kind);
}
