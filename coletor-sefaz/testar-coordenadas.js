import { corrigirCoordenadas } from "./enriquecer.js";

// [latitude recebida, longitude recebida, esperado]
const casos = [
  [-3.094, -60.021, { latitude: -3.094, longitude: -60.021 }],   // já correto
  [-60.021, -3.094, { latitude: -3.094, longitude: -60.021 }],   // invertido (como veio da SEFAZ)
  ["-60.0214", "-3.0940", { latitude: -3.094, longitude: -60.0214 }],
  [null, -60, null],
  ["", "", null],
  [undefined, undefined, null],
  [0, 0, { latitude: 0, longitude: 0 }],
  [120, 300, null]
];
let falhas = 0;
for (const [lat, lon, esperado] of casos) {
  const obtido = corrigirCoordenadas(lat, lon);
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "OK" : "FALHOU"} | (${lat}, ${lon}) -> ${JSON.stringify(obtido)}`);
  if (!ok) falhas++;
}
if (falhas) process.exit(1);
console.log(`\n${casos.length} verificações de coordenadas aprovadas.`);
