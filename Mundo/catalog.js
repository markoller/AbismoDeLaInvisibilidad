//Catálogo (acá se agregan modelos)

export const MODELS_PATH = '../Modelos/';

//Orden de importancia: de más grande o raro a menos. 
// Una categoría solo "evita" a las categorías que están antes en la lista.

export const ASSET_CATALOG = [
    {
        id: 'barco', placeholder: 'barco',
        models: ['pe_abisal.glb'],
        spacing: 320, density: 0.06, size: [60, 100], sink: 0.15,
        heightRange: [0, 0.35], maxSlope: 0.35, flat: 0.3,
        avoid: {},
    },
    {
        id: 'huesos', placeholder: 'huesos',
        models: ['pez_abis.glb', 'pez_asal.glb'],
        spacing: 220, density: 0.10, size: [30, 55], sink: 0.10,
        heightRange: [0, 0.40], maxSlope: 0.5, flat: 0.3,
        avoid: {barco: 25},
    },
    {
        id: 'selfies', placeholder: 'selfies',
        models: ['pez_abis.glb', 'pez_asal.glb'],
        spacing: 220, density: 0.10, size: [30, 55], sink: 0.10,
        heightRange: [0, 0.40], maxSlope: 0.5, flat: 0.3,
        avoid: {barco: 25},
    },
    {
        id: 'piedra', placeholder: 'piedra',
        models: ['pez_absal.glb', 'pez_abisl.glb', 'pez_abisal.glb'],
        spacing: 12, density: 0.40, size: [1.5, 6], sink: 0.25,
        heightRange: [0, 1.0], maxSlope: 1.2,
        patch: {scale: 90, strength: 0.8},
        avoid: {barco: 8, huesos: 6},
    },
    {
        id: 'algas', placeholder: 'algas',
        models: ['pez_aisal.glb', 'pez_abisl.glb'],
        spacing: 6, density: 0.70, size: [3, 9], sink: 0.05,
        heightRange: [0, 0.45], maxSlope: 0.6,
        patch: {scale: 60, strength: 0.9},
        avoid: {barco: 8, huesos: 6, piedra: 1.5},
    },
];
