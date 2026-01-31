// Test isLikelySprayRegistration function
function isLikelySprayRegistration(userInput: string): boolean {
  const normalizedInput = userInput.toLowerCase();

  // Bevat dosering patroon
  if (/\d+[,.]?\d*\s*(l|kg|ml|g)(\/ha)?/i.test(normalizedInput)) {
    return true;
  }

  // Bevat datum-achtige woorden
  if (/(gisteren|vandaag|vorige\s+week|maandag|dinsdag|woensdag|donderdag|vrijdag)/i.test(normalizedInput)) {
    return true;
  }

  // Bevat spray-gerelateerde woorden
  if (/(gespoten|spuiten|bespuiting|behandeld|gespuit)/i.test(normalizedInput)) {
    return true;
  }

  // [NIEUW] Bevat "[gewas/perceel] met [product]" patroon
  if (/\b(alle|de)?\s*(appel|peer|kers|pruim|fruit|elstar|jonagold|conference|kanzi|lucas|tessa|greenstar)\w*\s+(met|gespoten)\s+\w+/i.test(normalizedInput)) {
    return true;
  }

  // [NIEUW] Bevat variatie-patronen
  if (/\bmaar\b.*\b(ook|extra|nog)\b/i.test(normalizedInput)) {
    return true;
  }
  if (/\b(behalve|uitgezonderd|zonder de)\b/i.test(normalizedInput)) {
    return true;
  }
  if (/\bhalve\s*(dosering|dosis)\b/i.test(normalizedInput)) {
    return true;
  }

  return false;
}

const testInputs = [
    'Alle appels met Merpan, maar de Kanzi ook met Score',
    'Alle appels met Merpan',
    'Welke middelen tegen schurft?',
];

for (const input of testInputs) {
    const result = isLikelySprayRegistration(input);
    console.log(`"${input.slice(0, 50)}..." → ${result}`);
}
